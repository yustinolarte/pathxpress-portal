import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyPortalToken, passwordFingerprint, PORTAL_COOKIE, type PortalTokenPayload } from "../portalAuth";
import { getPortalUserById } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  portalUser: PortalTokenPayload | null;
};

/**
 * Resolves the portal session against the DB on every request. The JWT only
 * proves identity; role/clientId are taken from the current row (so permission
 * changes apply immediately), suspended users are rejected, and a token issued
 * before the last password change/reset no longer matches the fingerprint.
 */
async function resolvePortalUser(token: string): Promise<PortalTokenPayload | null> {
  const payload = verifyPortalToken(token);
  if (!payload) return null;
  const user = await getPortalUserById(payload.userId);
  if (!user || user.status !== "active") return null;
  if (payload.pwf !== passwordFingerprint(user.passwordHash)) return null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId ?? undefined,
    pwf: payload.pwf,
  };
}

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
  const portalToken = opts.req.cookies?.[PORTAL_COOKIE];
  if (portalToken) {
    portalUser = await resolvePortalUser(portalToken);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    portalUser,
  };
}
