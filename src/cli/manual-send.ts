import { select, input } from "@inquirer/prompts";
import { getTargets, logSend } from "../db/repository.js";
import {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
} from "../whatsapp/sender.js";

export async function showManualSend(): Promise<void> {
  const targets = await getTargets(true);

  if (targets.length === 0) {
    console.log("\n⚠️  No hay destinos activos. Primero agregá destinos.\n");
    return;
  }

  const targetId = await select({
    message: "Seleccioná el destino:",
    choices: targets.map((t) => ({
      name: `${t.name} [${t.type}]`,
      value: t.id,
    })),
  });

  const target = targets.find((t) => t.id === targetId)!;

  const contentType = await select({
    message: "Tipo de mensaje:",
    choices: [
      { name: "📝 Texto", value: "text" },
      { name: "🖼️  Imagen", value: "image" },
      { name: "🎥 Video", value: "video" },
      { name: "📄 Documento", value: "document" },
    ],
  });

  try {
    if (contentType === "text") {
      const text = await input({
        message: "Escribí el mensaje:",
        validate: (v) => (v.trim() ? true : "No puede estar vacío"),
      });

      console.log(`\n📤 Enviando a ${target.name}...`);
      await sendTextMessage(target.jid, text);
    } else if (contentType === "image") {
      const path = await input({ message: "Ruta a la imagen:" });
      const caption = await input({ message: "Caption (enter para omitir):" });

      console.log(`\n📤 Enviando imagen a ${target.name}...`);
      await sendImageMessage(target.jid, path.trim(), caption || undefined);
    } else if (contentType === "video") {
      const path = await input({ message: "Ruta al video:" });
      const caption = await input({ message: "Caption (enter para omitir):" });

      console.log(`\n📤 Enviando video a ${target.name}...`);
      await sendVideoMessage(target.jid, path.trim(), caption || undefined);
    } else {
      const path = await input({ message: "Ruta al archivo:" });
      const filename = await input({ message: "Nombre del archivo (enter para usar el original):" });

      console.log(`\n📤 Enviando documento a ${target.name}...`);
      await sendDocumentMessage(target.jid, path.trim(), filename || undefined);
    }

    await logSend(targetId, null, "sent");
    console.log("✅ Mensaje enviado exitosamente\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logSend(targetId, null, "failed", errorMsg);
    console.log(`\n❌ Error al enviar: ${errorMsg}\n`);
  }
}
