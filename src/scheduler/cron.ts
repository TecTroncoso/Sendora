import cron from "node-cron";
import {
  getScheduledContent,
  updateLastSent,
  logSend,
} from "../db/repository.js";
import {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  sendWithRateLimit,
} from "../whatsapp/sender.js";

const activeJobs = new Map<number, cron.ScheduledTask>();

export async function startScheduler(): Promise<void> {
  const content = await getScheduledContent(true);

  if (content.length === 0) {
    console.log("\n📭 No hay contenido programado activo.");
    console.log("   Usá 'Programar contenido' para agregar envíos.\n");
    return;
  }

  // Limpiar jobs anteriores
  for (const [id, job] of activeJobs) {
    job.stop();
    activeJobs.delete(id);
  }

  console.log(`\n▶️  Iniciando scheduler con ${content.length} envío(s) programados:\n`);

  for (const item of content) {
    if (!cron.validate(item.cron_expression)) {
      console.log(`  ⚠️  Cron inválido para #${item.id}: "${item.cron_expression}" — omitido`);
      continue;
    }

    const job = cron.schedule(item.cron_expression, async () => {
      console.log(`\n📤 [Scheduler] Enviando a ${item.target_name}...`);

      try {
        await sendWithRateLimit(item.target_jid, async () => {
          switch (item.content_type) {
            case "text":
              await sendTextMessage(item.target_jid, item.content_text!);
              break;
            case "image":
              await sendImageMessage(
                item.target_jid,
                item.content_path!,
                item.content_text ?? undefined
              );
              break;
            case "video":
              await sendVideoMessage(
                item.target_jid,
                item.content_path!,
                item.content_text ?? undefined
              );
              break;
            case "document":
              await sendDocumentMessage(item.target_jid, item.content_path!);
              break;
          }
        });

        await updateLastSent(item.id);
        await logSend(item.target_id, item.id, "sent");
        console.log(`  ✅ Enviado a ${item.target_name}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await logSend(item.target_id, item.id, "failed", errorMsg);
        console.log(`  ❌ Error enviando a ${item.target_name}: ${errorMsg}`);
      }
    });

    activeJobs.set(item.id, job);

    const typeEmoji: Record<string, string> = {
      text: "📝",
      image: "🖼️",
      video: "🎥",
      document: "📄",
    };

    console.log(
      `  🕐 #${item.id} ${typeEmoji[item.content_type]} → ${item.target_name} | ${item.cron_expression}`
    );
  }

  console.log("\n✅ Scheduler activo. Los mensajes se enviarán según las expresiones cron.");
  console.log("   El scheduler corre en background mientras usás el menú.\n");
}

export function stopScheduler(): void {
  for (const [id, job] of activeJobs) {
    job.stop();
    activeJobs.delete(id);
  }
  console.log("⏹️  Scheduler detenido\n");
}
