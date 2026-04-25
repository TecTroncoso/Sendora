import "dotenv/config";

export const config = {
  turso: {
    url: process.env.TURSO_DATABASE_URL ?? "",
    authToken: process.env.TURSO_AUTH_TOKEN ?? "",
  },
  whatsapp: {
    authDir: "auth_info",
  },
  scheduler: {
    interFileDelayMs: 800,   // delay entre archivos al mismo destinatario
    rateLimitDelayMs: 1500,  // delay entre envíos programados para evitar ban
  },
} as const;

export function validateConfig(): void {
  if (!config.turso.url) {
    throw new Error("TURSO_DATABASE_URL no está configurada en .env");
  }
  if (!config.turso.authToken) {
    throw new Error("TURSO_AUTH_TOKEN no está configurado en .env");
  }
}
