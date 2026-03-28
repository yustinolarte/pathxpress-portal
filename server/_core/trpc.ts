import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { PortalTokenPayload } from "../portalAuth";

// Customer portal users always have clientId (guaranteed by middleware check)
type CustomerPortalUser = Omit<PortalTokenPayload, 'clientId'> & { clientId: number };

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Portal-specific procedures (use portalUser from HttpOnly cookie, separate from OAuth users)
export const portalProtectedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Portal login required' });
    }
    return next({ ctx: { ...ctx, portalUser: ctx.portalUser } });
  }),
);

export const portalAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx: { ...ctx, portalUser: ctx.portalUser } });
  }),
);

export const portalCustomerProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser || ctx.portalUser.role !== 'customer' || !ctx.portalUser.clientId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
    }
    // Cast to CustomerPortalUser so TypeScript knows clientId is number (not number | undefined)
    const portalUser = ctx.portalUser as CustomerPortalUser;
    return next({ ctx: { ...ctx, portalUser } });
  }),
);
