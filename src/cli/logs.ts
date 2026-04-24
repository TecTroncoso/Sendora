import { getSendLogs } from "../db/repository.js";

export async function showSendLogs(): Promise<void> {
  const logs = await getSendLogs(30);

  if (logs.length === 0) {
    console.log("\n📊 No hay registros de envío aún.\n");
    return;
  }

  console.log("\n📊 Últimos envíos:\n");
  console.log("  Estado │ Destino                │ Fecha");
  console.log("  ───────┼────────────────────────┼─────────────────────");

  for (const log of logs) {
    const statusIcon = log.status === "sent" ? "✅" : "❌";
    const name = log.target_name.padEnd(22).substring(0, 22);
    const date = log.sent_at ?? "—";
    console.log(`  ${statusIcon}     │ ${name} │ ${date}`);
    if (log.error_message) {
      console.log(`         │ ⚠️ ${log.error_message.substring(0, 50)}`);
    }
  }
  console.log();
}
