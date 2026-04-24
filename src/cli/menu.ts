import { select } from "@inquirer/prompts";
import { showContactsList, showGroupsList, showChannelsList, showSavedTargets } from "./list-targets.js";
import { showScheduleContent } from "./schedule-content.js";
import { showManualSend } from "./manual-send.js";
import { startScheduler } from "../scheduler/cron.js";
import { showSendLogs } from "./logs.js";

export async function showMainMenu(): Promise<void> {
  let running = true;

  while (running) {
    console.log("\n🤖 ═══════════════════════════════════════");
    console.log("   WhatsApp Automatización");
    console.log("═══════════════════════════════════════════\n");

    const choice = await select({
      message: "¿Qué querés hacer?",
      choices: [
        { name: "📇  Listar contactos", value: "contacts" },
        { name: "👥  Listar grupos", value: "groups" },
        { name: "📢  Listar canales", value: "channels" },
        { name: "✅  Ver destinos guardados", value: "targets" },
        { name: "📝  Programar contenido", value: "schedule" },
        { name: "📤  Enviar mensaje manual", value: "manual" },
        { name: "▶️   Iniciar scheduler", value: "scheduler" },
        { name: "📊  Ver log de envíos", value: "logs" },
        { name: "❌  Salir", value: "exit" },
      ],
    });

    switch (choice) {
      case "contacts":
        await showContactsList();
        break;
      case "groups":
        await showGroupsList();
        break;
      case "channels":
        await showChannelsList();
        break;
      case "targets":
        await showSavedTargets();
        break;
      case "schedule":
        await showScheduleContent();
        break;
      case "manual":
        await showManualSend();
        break;
      case "scheduler":
        await startScheduler();
        break;
      case "logs":
        await showSendLogs();
        break;
      case "exit":
        running = false;
        console.log("\n👋 ¡Hasta luego!\n");
        break;
    }
  }
}
