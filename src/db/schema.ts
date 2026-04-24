import { getDb } from "./client.js";

export async function initDatabase(): Promise<void> {
  const db = getDb();

  // Migración para soportar archivos mixtos
  try {
    const master = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduled_content'");
    if (master.rows.length > 0) {
      const sql = master.rows[0].sql as string;
      if (sql.includes("CHECK(content_type IN ('text', 'image', 'video', 'document'))")) {
        console.log("📦 Migrando tabla scheduled_content para soportar envíos mixtos...");
        await db.execute("PRAGMA foreign_keys=off");
        await db.execute("ALTER TABLE scheduled_content RENAME TO scheduled_content_old");
        
        await db.execute(`CREATE TABLE scheduled_content (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          target_id INTEGER NOT NULL,
          content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'video', 'document', 'mixed')),
          content_text TEXT,
          content_path TEXT,
          cron_expression TEXT NOT NULL,
          last_sent_at TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
        )`);
          
        await db.execute(`INSERT INTO scheduled_content (id, session_id, target_id, content_type, content_text, content_path, cron_expression, last_sent_at, active, created_at)
                          SELECT id, session_id, target_id, content_type, content_text, content_path, cron_expression, last_sent_at, active, created_at FROM scheduled_content_old`);
        await db.execute("DROP TABLE scheduled_content_old");
        await db.execute("PRAGMA foreign_keys=on");
        console.log("✅ Migración de scheduled_content completada.");
      }
    }

    // Fix for broken foreign keys in send_log after previous migration
    const sendLogMaster = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='send_log'");
    if (sendLogMaster.rows.length > 0) {
      const sql = sendLogMaster.rows[0].sql as string;
      if (sql.includes("scheduled_content_old")) {
        console.log("📦 Corrigiendo referencias rotas en send_log...");
        await db.execute("PRAGMA foreign_keys=off");
        await db.execute("ALTER TABLE send_log RENAME TO send_log_broken");
        await db.execute(`CREATE TABLE send_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          target_id INTEGER NOT NULL,
          content_id INTEGER,
          status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
          error_message TEXT,
          sent_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
          FOREIGN KEY (content_id) REFERENCES scheduled_content(id) ON DELETE SET NULL
        )`);
        await db.execute(`INSERT INTO send_log SELECT * FROM send_log_broken`);
        await db.execute("DROP TABLE send_log_broken");
        await db.execute("PRAGMA foreign_keys=on");
        console.log("✅ Corrección de send_log completada.");
      }
    }
  } catch (err) {
    console.error("Error comprobando migración:", err);
  }

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
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'video', 'document', 'mixed')),
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
