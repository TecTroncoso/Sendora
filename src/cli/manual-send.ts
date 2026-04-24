import { select, input, confirm } from "@inquirer/prompts";
import { getTargets, logSend } from "../db/repository.js";
import { sendMixedContent } from "../whatsapp/sender.js";

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

  try {
    let text = await input({
      message: "Escribí el texto del mensaje (enter para enviar solo archivos):",
    });
    if (!text.trim()) text = "";

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

    if (!text && filePaths.length === 0) {
      console.log("\n⚠️  Operación cancelada: No hay texto ni archivos para enviar.\n");
      return;
    }

    console.log(`\n📤 Enviando a ${target.name}...`);
    await sendMixedContent(target.jid, text || undefined, filePaths);

    await logSend(targetId, null, "sent");
    console.log("✅ Mensaje enviado exitosamente\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logSend(targetId, null, "failed", errorMsg);
    console.log(`\n❌ Error al enviar: ${errorMsg}\n`);
  }
}
