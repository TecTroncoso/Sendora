import { getDb } from "./src/db/client.js";

async function main() {
  const db = getDb();
  console.log("Borrando todos los registros de auth_state de Turso...");
  await db.execute("DELETE FROM auth_state;");
  console.log("✅ Registros borrados exitosamente.");
  process.exit(0);
}

main().catch(console.error);
