import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyPortalToken, type PortalTokenPayload } from "../portalAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  portalUser: PortalTokenPayload | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let portalUser: PortalTokenPayload | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Read portal token from HttpOnly cookie
  const portalToken = opts.req.cookies?.['pathxpress_portal_token'];
  if (portalToken) {
    portalUser = verifyPortalToken(portalToken);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    portalUser,
  };
}
