import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { portalAdminProcedure, router } from './_core/trpc';
import { renderEmail, isAllowedFrom, getTemplate } from '@shared/emailTemplates';
import { sendViaResend } from './_core/resendMailer';

/**
 * Email Studio — envío manual de correos de marca por un admin del portal.
 * El servidor RE-RENDERIZA la plantilla a partir de (templateKey + vars) para
 * garantizar el layout de marca; nunca confía en HTML enviado por el cliente.
 */
export const emailRouter = router({
  send: portalAdminProcedure
    .input(
      z.object({
        templateKey: z.string().min(1),
        from: z.string().min(3),
        to: z.string().email(),
        vars: z.record(z.string(), z.string()).default({}),
        subjectOverride: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1) sender must be in the allowlist
      if (!isAllowedFrom(input.from)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sender not allowed.' });
      }

      // 2) template must exist
      if (!getTemplate(input.templateKey)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown template.' });
      }

      // 3) server-side render (brand guaranteed)
      const rendered = renderEmail(input.templateKey, input.vars, input.from);
      if (!rendered) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not render the template.' });
      }

      const subject = input.subjectOverride && input.subjectOverride.length > 0
        ? input.subjectOverride
        : rendered.subject;

      // 4) send via Resend
      try {
        const result = await sendViaResend({
          from: input.from,
          to: input.to,
          subject,
          html: rendered.html,
        });
        return { ok: true as const, id: result.id, to: input.to };
      } catch (err: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err?.message || 'Could not send the email.',
        });
      }
    }),
});
