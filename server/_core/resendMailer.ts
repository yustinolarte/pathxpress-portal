import { ENV } from './env';

export interface ResendSendInput {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface ResendSendResult {
  id: string;
}

/**
 * Envía un correo HTML a través de la API de Resend.
 * La API key vive solo en el servidor (ENV.resendApiKey).
 * Lanza Error con mensaje legible si falla (para que tRPC lo convierta en TRPCError).
 */
export async function sendViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = ENV.resendApiKey;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo || undefined,
    }),
  });

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || data?.name || 'Resend rejected the email';
    throw new Error(msg);
  }

  return { id: data?.id ?? '' };
}
