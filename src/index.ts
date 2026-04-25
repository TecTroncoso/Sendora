import { select, input } from "@inquirer/prompts";
import { config, validateConfig } from "./config/env.js";
import { initDatabase } from "./db/schema.js";
import { closeDb } from "./db/client.js";
import { connectWhatsApp, type AuthMode } from "./whatsapp/connection.js";
import { initContactsListener, waitForSync } from "./whatsapp/contacts.js";
import { initChannelsListener } from "./whatsapp/channels.js";
import { showMainMenu } from "./cli/menu.js";
import { stopScheduler } from "./scheduler/cron.js";
import { startWebServer } from "./web/server.js";
import { getSessionId } from "./config/session.js";
import { hasValidSession } from "./whatsapp/authState.js";

// Silenciar console.info que usa libsignal internamente (evita el spam de "Closing session")
const originalConsoleInfo = console.info;
console.info = function (...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes("Closing session")) {
    return;
  }
  originalConsoleInfo.apply(console, args);
};

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║   🤖 WhatsApp Automatización v1.0.0      ║");
  console.log("║   Powered by Baileys + Turso              ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  // Validar config
  try {
    validateConfig();
  } catch (error) {
    console.error(`\n❌ ${(error as Error).message}`);
    console.error("   Copiá .env.example a .env y completá los valores.\n");
    process.exit(1);
  }

  // Inicializar base de datos
  console.log("📦 Inicializando base de datos...");
  await initDatabase();

  const interfaceMode = await select({
    message: "¿Qué interfaz querés usar para controlar el bot?",
    choices: [
      { name: "🖥️  Terminal (CLI Interactiva)", value: "cli" },
      { name: "🌐  Servidor Web (Dashboard UI)", value: "web" },
    ]
  });

  if (interfaceMode === "web") {
    const sessionId = getSessionId();
    const isRegistered = await hasValidSession(sessionId);

    await startWebServer(3000);
    
    if (isRegistered) {
      console.log("✅ Sesión guardada detectada. Auto-conectando al bot...");
      try {
        await connectWhatsApp("qr");
        await initContactsListener();
        await initChannelsListener();
      } catch (err) {
        console.error("Error al auto-conectar:", err);
      }
    }

    console.log("Presioná Ctrl+C para detener el servidor.");
    // Mantenemos el proceso vivo
    await new Promise(() => {});
  } else {
    // Seleccionar método de autenticación
    const authMode = await select({
      message: "Método de autenticación:",
      choices: [
        { name: "📱 QR Code (escaneá desde el celular)", value: "qr" as AuthMode },
        { name: "🔑 Pairing Code (código numérico)", value: "pairing" as AuthMode },
      ],
    });

    let phoneNumber: string | undefined;
    if (authMode === "pairing") {
      phoneNumber = await input({
        message: "Número de teléfono (sin +, sin espacios, ej: 5491112345678):",
        validate: (v) =>
          /^\d{10,15}$/.test(v.trim()) ? true : "Ingresá solo números (10-15 dígitos)",
      });
    }

    // Conectar a WhatsApp
    console.log("\n📡 Conectando a WhatsApp...");
    if (authMode === "qr") {
      console.log("   Esperando QR code... Escanealo desde WhatsApp > Dispositivos vinculados\n");
    }

    try {
      const sock = await connectWhatsApp(authMode, phoneNumber?.trim());

      // Inicializar listeners de datos (await para cargar caché)
      await initContactsListener();
      await initChannelsListener();

      // Esperar sincronización inteligente: si hay caché resuelve al toque,
      // si no, espera hasta 8s al primer batch de messaging-history.set
      console.log("⏳ Sincronizando datos de WhatsApp...");
      await waitForSync();

      // Mostrar menú principal
      await showMainMenu();
    } catch (error) {
      console.error(`\n❌ Error de conexión: ${(error as Error).message}\n`);
    }
  }
}

// Manejar cierre limpio
process.on("SIGINT", () => {
  console.log("\n\n👋 Cerrando...");
  stopScheduler();
  closeDb();
  process.exit(0);
});

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
