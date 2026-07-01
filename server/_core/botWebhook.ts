import { ENV } from "./env";

export type NewOrderWebhookPayload = {
  waybillNumber: string;
  customerName: string;
  customerPhone: string;
};

/**
 * Fire-and-forget notification to the location bot (Bot Ubicación) so it can
 * ask the consignee for their WhatsApp location right after an order is
 * created. No-op when BOT_WEBHOOK_URL isn't configured, and never throws —
 * order creation must never fail because the bot is offline or unreachable.
 */
export function notifyBotNewOrder(payload: NewOrderWebhookPayload): void {
  if (!ENV.botWebhookUrl) return;

  fetch(ENV.botWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": ENV.botWebhookSecret,
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn("[BotWebhook] Failed to notify location bot of new order:", error);
  });
}
