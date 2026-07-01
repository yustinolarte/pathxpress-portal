export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  emailUser: process.env.EMAIL_USER ?? "",
  emailAppPassword: process.env.EMAIL_APP_PASSWORD ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",  // Email Studio (correos de marca vía Resend)
  botApiKey: process.env.BOT_API_KEY ?? "",  // Shared secret for Pathx WhatsApp bot
  botWebhookUrl: process.env.BOT_WEBHOOK_URL ?? "",       // Bot Ubicación: notified on every new order
  botWebhookSecret: process.env.BOT_WEBHOOK_SECRET ?? "", // Shared secret for that webhook call
};
