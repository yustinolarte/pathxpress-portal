import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import driverApiRouter from "../driverApi";
import botRouter from "../botRouter";
import shopifyIntegrationRouter from "../shopifyIntegrationApi";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy (Railway/Load Balancer) to fix rate-limiting and IP detection
  app.set("trust proxy", 1);

  // Gzip/Brotli compression — reduces JSON response sizes by ~80-90%
  app.use(compression());

  // CORS
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://pathxpress.net', 'https://www.pathxpress.net']
      : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  }));

  // Security middleware
  app.use(
    helmet({
      // Only in production: dev mode serves through Vite (inline HMR client, eval'd
      // modules) which a locked-down CSP would break. The allowlist below covers every
      // external origin the app actually loads: Google Maps JS SDK + Geocoding
      // (maps.googleapis.com / *.googleapis.com), Google Fonts, unpkg (Leaflet), and
      // self-hosted assets/API. 'unsafe-inline' stays on script-src/style-src because
      // index.html uses an inline onload= font-swap attribute and several UI libraries
      // (Radix/Framer Motion) inject inline style attributes — moving to a nonce-based
      // policy would need a separate, browser-tested pass.
      contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com", "https://unpkg.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          connectSrc: ["'self'", "https://maps.googleapis.com", "https://*.googleapis.com"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
        },
      } : false,
      frameguard: { action: "deny" }, // Clickjacking protection
      hsts: true, // HTTP Strict Transport Security
      noSniff: true, // Prevent MIME type sniffing
      hidePoweredBy: true, // Hide X-Powered-By header
    })
  );

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each IP to 300 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 login/password-change attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many login attempts from this IP, please try again after 15 minutes",
  });

  const trackingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many tracking lookups from this IP, please try again after 15 minutes",
  });

  // tRPC batches multiple calls into one request as a comma-separated procedure
  // list in the URL, e.g. /api/trpc/portal.auth.login,portal.auth.me?batch=1 — an
  // exact-path `app.use("/api/trpc/portal.auth.login", ...)` never matches that
  // (the "," isn't a path-segment boundary), silently letting batched calls skip
  // the limiter. Inspect the actual procedure names instead of path-prefix matching.
  function trpcBatchedProcedures(req: express.Request): string[] {
    const prefix = "/api/trpc/";
    if (!req.originalUrl.startsWith(prefix)) return [];
    const afterPrefix = req.originalUrl.slice(prefix.length).split("?")[0];
    try {
      return decodeURIComponent(afterPrefix).split(",");
    } catch {
      return afterPrefix.split(",");
    }
  }

  const AUTH_PROCEDURES = new Set(["portal.auth.login", "portal.auth.changePassword"]);
  const TRACKING_PROCEDURES = new Set(["tracking.getByTrackingId"]);

  app.use((req, res, next) => {
    const procedures = trpcBatchedProcedures(req);
    if (procedures.some(p => AUTH_PROCEDURES.has(p))) return authLimiter(req, res, next);
    if (procedures.some(p => TRACKING_PROCEDURES.has(p))) return trackingLimiter(req, res, next);
    next();
  });

  // Apply rate limiting
  app.use("/api/driver/auth/login", authLimiter);
  app.use("/api", apiLimiter);

  // Cookie parser (must be before tRPC middleware)
  app.use(cookieParser());

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Driver API (REST endpoints for mobile app)
  app.use("/api/driver", driverApiRouter);
  // Pathx WhatsApp Bot API (REST endpoints protected by X-Bot-Key header)
  app.use("/api/bot", botRouter);
  // Shopify Integration API (server-to-server, Bearer token auth)
  app.use("/api/shopify", shopifyIntegrationRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
