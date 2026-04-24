import { select, input, confirm } from "@inquirer/prompts";
import {
  getTargets,
  addScheduledContent,
  getScheduledContent,
  deleteScheduledContent,
  type ScheduledContent,
} from "../db/repository.js";

export async function showScheduleContent(): Promise<void> {
  const action = await select({
    message: "Contenido programado:",
    choices: [
      { name: "➕ Programar nuevo contenido", value: "new" },
      { name: "📋 Ver contenido programado", value: "list" },
      { name: "⬅️  Volver", value: "back" },
    ],
  });

  if (action === "new") {
    await scheduleNewContent();
  } else if (action === "list") {
    await listScheduledContent();
  }
}

async function scheduleNewContent(): Promise<void> {
  const targets = await getTargets(true);

  if (targets.length === 0) {
    console.log("\n⚠️  No hay destinos activos. Primero agregá destinos desde el menú principal.\n");
    return;
  }

  // Seleccionar destino
  const targetId = await select({
    message: "Seleccioná el destino:",
    choices: targets.map((t) => ({
      name: `${t.name} [${t.type}]`,
      value: t.id,
    })),
  });

  // Texto del mensaje
  let contentText = await input({
    message: "Texto del mensaje (enter para enviar solo archivos):",
  });
  if (!contentText.trim()) contentText = "";

  // Recolectar archivos
  const filePaths: string[] = [];
  let addMoreFiles = await confirm({
    message: "¿Querés adjuntar archivos (fotos, videos, documentos)?",
    default: false,
  });

  while (addMoreFiles) {
    const path = await input({
      message: "Ruta absoluta al archivo:",
      validate: (v) => (v.trim() ? true : "La ruta no puede estar vacía"),
    });
    filePaths.push(path.trim());

    addMoreFiles = await confirm({
      message: "¿Querés agregar otro archivo más?",
      default: false,
    });
  }

  if (!contentText && filePaths.length === 0) {
    console.log("\n⚠️  Operación cancelada: No hay texto ni archivos para programar.\n");
    return;
  }

  // Determinar content_type automáticamente
  let contentType: ScheduledContent["content_type"];
  let contentPath: string | string[] | undefined;

  if (filePaths.length === 0) {
    contentType = "text";
  } else if (filePaths.length === 1) {
    // Un solo archivo: usar tipo legacy para compatibilidad
    const ext = filePaths[0].split(".").pop()?.toLowerCase() ?? "";
    const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
    const videoExts = ["mp4", "avi", "mov"];
    if (imageExts.includes(ext)) contentType = "image";
    else if (videoExts.includes(ext)) contentType = "video";
    else contentType = "document";
    contentPath = filePaths[0];
  } else {
    // Múltiples archivos: tipo mixed con array JSON
    contentType = "mixed";
    contentPath = filePaths;
  }

  // Expresión cron
  console.log("\n📅 Ejemplos de expresiones cron:");
  console.log("   Cada hora:          0 * * * *");
  console.log("   Cada día a las 9am: 0 9 * * *");
  console.log("   Lun-Vie a las 8am:  0 8 * * 1-5");
  console.log("   Cada 30 minutos:    */30 * * * *\n");

  const cronExpression = await input({
    message: "Expresión cron:",
    validate: (v) => {
      const parts = v.trim().split(/\s+/);
      return parts.length === 5 ? true : "Formato: minuto hora díaMes mes díaSemana (5 campos)";
    },
  });

  const id = await addScheduledContent(
    targetId,
    contentType,
    cronExpression.trim(),
    contentText || undefined,
    contentPath
  );

  console.log(`\n✅ Contenido programado con ID #${id}`);
  if (filePaths.length > 0) {
    console.log(`   📎 ${filePaths.length} archivo(s) adjuntado(s)`);
  }
  console.log("   Iniciá el scheduler desde el menú para activar los envíos.\n");
}

async function listScheduledContent(): Promise<void> {
  const content = await getScheduledContent(false);

  if (content.length === 0) {
    console.log("\n📭 No hay contenido programado.\n");
    return;
  }

  console.log("\n📋 Contenido programado:\n");

  const typeEmoji: Record<string, string> = {
    text: "📝",
    image: "🖼️",
    video: "🎥",
    document: "📄",
    mixed: "📦",
  };

  for (const c of content) {
    const status = c.active ? "🟢" : "🔴";
    console.log(
      `  ${status} #${c.id} ${typeEmoji[c.content_type] ?? "❓"} → ${c.target_name} | cron: ${c.cron_expression}`
    );
    if (c.content_text) {
      console.log(`     "${c.content_text.substring(0, 60)}${c.content_text.length > 60 ? "..." : ""}"`);
    }
    if (c.content_type === "mixed" && c.content_path) {
      try {
        const paths = JSON.parse(c.content_path);
        if (Array.isArray(paths)) {
          console.log(`     📎 ${paths.length} archivo(s)`);
        }
      } catch { /* legacy path, ignore */ }
    }
    if (c.last_sent_at) {
      console.log(`     Último envío: ${c.last_sent_at}`);
    }
  }
  console.log();

  const shouldDelete = await select({
    message: "¿Querés eliminar algún contenido programado?",
    choices: [
      { name: "🗑️  Sí, eliminar uno", value: "delete" },
      { name: "⬅️  Volver", value: "back" },
    ],
  });

  if (shouldDelete === "delete") {
    const contentId = await select({
      message: "Seleccioná contenido para eliminar:",
      choices: content.map((c) => ({
        name: `#${c.id} ${typeEmoji[c.content_type] ?? "❓"} → ${c.target_name} (${c.cron_expression})`,
        value: c.id,
      })),
    });

    await deleteScheduledContent(contentId);
    console.log("🗑️  Contenido eliminado\n");
  }
}
