import { getDb } from "./src/db/client.js";
import { getSessionId } from "./src/config/session.js";

async function check() {
  const db = getDb();
  const sessionId = getSessionId();
  const res = await db.execute({
    sql: "SELECT count(*) as count FROM auth_state WHERE session_id = ?",
    args: [sessionId]
  });
  console.log(`Auth state rows for ${sessionId}:`, res.rows[0].count);
  
  const creds = await db.execute({
    sql: "SELECT data FROM auth_state WHERE session_id = ? AND key_id = 'creds'",
    args: [sessionId]
  });
  console.log(`Creds found:`, creds.rows.length > 0);
}

check().catch(console.error);
