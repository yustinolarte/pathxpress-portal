import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

const BOT_TIMEOUT_MS = 8000;

/**
 * Server-to-server call to the WhatsApp location bot's admin API. Only used
 * for actions that need the live WhatsApp socket (send, pause, re-request);
 * reads go straight to the bot_* tables. Authenticated with the same shared
 * secret as the new-order webhook.
 */
export async function botFetch<T>(path: string, body?: unknown): Promise<T> {
  if (!ENV.botBaseUrl) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "BOT_BASE_URL is not configured on the server" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ENV.botBaseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": ENV.botWebhookSecret },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The WhatsApp bot is not reachable right now" });
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const code = res.status === 404 ? "NOT_FOUND" : res.status === 503 ? "SERVICE_UNAVAILABLE" : res.status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST";
    throw new TRPCError({ code, message: data.error ?? `The WhatsApp bot returned HTTP ${res.status}` });
  }
  return data as T;
}
