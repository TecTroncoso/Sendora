import { getDb } from "./client.js";

export async function initDatabase(): Promise<void> {
  const db = getDb();

  await db.batch(
    [
      // Sesión de Baileys
      `CREATE TABLE IF NOT EXISTS auth_state (
        session_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (session_id, key_id)
      )`,

      // Caché de contactos/canales
      `CREATE TABLE IF NOT EXISTS whatsapp_cache (
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (session_id, type)
      )`,

      // Destinos guardados por el usuario
      `CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('contact', 'group', 'channel')),
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(session_id, jid)
      )`,

      // Contenido programado
      `CREATE TABLE IF NOT EXISTS scheduled_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'video', 'document')),
        content_text TEXT,
        content_path TEXT,
        cron_expression TEXT NOT NULL,
        last_sent_at TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
      )`,

      // Historial de envíos
      `CREATE TABLE IF NOT EXISTS send_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        content_id INTEGER,
        status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
        error_message TEXT,
        sent_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
        FOREIGN KEY (content_id) REFERENCES scheduled_content(id) ON DELETE SET NULL
      )`
    ],
    "write"
  );

  console.log("✅ Base de datos (multi-usuario) inicializada correctamente");
}
