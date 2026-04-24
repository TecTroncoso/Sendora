import { select, input } from "@inquirer/prompts";
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

  // Tipo de contenido
  const contentType = await select({
    message: "Tipo de contenido:",
    choices: [
      { name: "📝 Texto", value: "text" as const },
      { name: "🖼️  Imagen", value: "image" as const },
      { name: "🎥 Video", value: "video" as const },
      { name: "📄 Documento", value: "document" as const },
    ],
  });

  let contentText: string | undefined;
  let contentPath: string | undefined;

  if (contentType === "text") {
    contentText = await input({
      message: "Escribí el mensaje:",
      validate: (v) => (v.trim().length > 0 ? true : "El mensaje no puede estar vacío"),
    });
  } else {
    contentPath = await input({
      message: `Ruta al archivo (${contentType}):`,
      validate: (v) => (v.trim().length > 0 ? true : "La ruta no puede estar vacía"),
    });

    contentText = await input({
      message: "Caption (opcional, enter para omitir):",
    });
    if (contentText.trim() === "") contentText = undefined;
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
    contentText,
    contentPath
  );

  console.log(`\n✅ Contenido programado con ID #${id}`);
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
  };

  for (const c of content) {
    const status = c.active ? "🟢" : "🔴";
    console.log(
      `  ${status} #${c.id} ${typeEmoji[c.content_type]} → ${c.target_name} | cron: ${c.cron_expression}`
    );
    if (c.content_text) {
      console.log(`     "${c.content_text.substring(0, 60)}${c.content_text.length > 60 ? "..." : ""}"`);
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
        name: `#${c.id} ${typeEmoji[c.content_type]} → ${c.target_name} (${c.cron_expression})`,
        value: c.id,
      })),
    });

    await deleteScheduledContent(contentId);
    console.log("🗑️  Contenido eliminado\n");
  }
}
