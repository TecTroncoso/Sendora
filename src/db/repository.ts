import { getDb } from "./client.js";
import { getSessionId } from "../config/session.js";

// ── Targets ──────────────────────────────────────────────

export interface Target {
  id: number;
  session_id: string;
  jid: string;
  name: string;
  type: "contact" | "group" | "channel";
  active: number;
  created_at: string;
}

export async function addTarget(
  jid: string,
  name: string,
  type: Target["type"]
): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: `INSERT OR IGNORE INTO targets (session_id, jid, name, type) VALUES (?, ?, ?, ?)`,
    args: [sessionId, jid, name, type],
  });
}

export async function addTargets(
  targets: Array<{ jid: string; name: string; type: Target["type"] }>
): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  const statements = targets.map((t) => ({
    sql: `INSERT OR IGNORE INTO targets (session_id, jid, name, type) VALUES (?, ?, ?, ?)`,
    args: [sessionId, t.jid, t.name, t.type] as [string, string, string, string],
  }));
  if (statements.length > 0) {
    await db.batch(statements, "write");
  }
}

export async function getTargets(onlyActive = false): Promise<Target[]> {
  const db = getDb();
  const sessionId = getSessionId();
  const sql = onlyActive
    ? "SELECT * FROM targets WHERE session_id = ? AND active = 1 ORDER BY type, name"
    : "SELECT * FROM targets WHERE session_id = ? ORDER BY type, name";
  const result = await db.execute({ sql, args: [sessionId] });
  return result.rows as unknown as Target[];
}

export async function toggleTarget(id: number): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: "UPDATE targets SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ? AND session_id = ?",
    args: [id, sessionId],
  });
}

export async function removeTarget(id: number): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: "DELETE FROM targets WHERE id = ? AND session_id = ?",
    args: [id, sessionId],
  });
}

// ── Scheduled Content ────────────────────────────────────

export interface ScheduledContent {
  id: number;
  session_id: string;
  target_id: number;
  content_type: "text" | "image" | "video" | "document";
  content_text: string | null;
  content_path: string | null;
  cron_expression: string;
  last_sent_at: string | null;
  active: number;
  created_at: string;
}

export async function addScheduledContent(
  targetId: number,
  contentType: ScheduledContent["content_type"],
  cronExpression: string,
  contentText?: string,
  contentPath?: string
): Promise<number> {
  const db = getDb();
  const sessionId = getSessionId();
  const result = await db.execute({
    sql: `INSERT INTO scheduled_content (session_id, target_id, content_type, content_text, content_path, cron_expression)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [sessionId, targetId, contentType, contentText ?? null, contentPath ?? null, cronExpression],
  });
  return Number(result.lastInsertRowid);
}

export async function getScheduledContent(
  onlyActive = true
): Promise<(ScheduledContent & { target_name: string; target_jid: string })[]> {
  const db = getDb();
  const sessionId = getSessionId();
  const sql = `
    SELECT sc.*, t.name as target_name, t.jid as target_jid
    FROM scheduled_content sc
    JOIN targets t ON sc.target_id = t.id
    WHERE sc.session_id = ? ${onlyActive ? "AND sc.active = 1 AND t.active = 1" : ""}
    ORDER BY sc.created_at DESC
  `;
  const result = await db.execute({ sql, args: [sessionId] });
  return result.rows as unknown as (ScheduledContent & {
    target_name: string;
    target_jid: string;
  })[];
}

export async function updateLastSent(contentId: number): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: "UPDATE scheduled_content SET last_sent_at = datetime('now') WHERE id = ? AND session_id = ?",
    args: [contentId, sessionId],
  });
}

export async function deleteScheduledContent(id: number): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: "DELETE FROM scheduled_content WHERE id = ? AND session_id = ?",
    args: [id, sessionId],
  });
}

// ── Send Log ─────────────────────────────────────────────

export interface SendLog {
  id: number;
  session_id: string;
  target_id: number;
  content_id: number | null;
  status: "sent" | "failed";
  error_message: string | null;
  sent_at: string;
}

export async function logSend(
  targetId: number,
  contentId: number | null,
  status: SendLog["status"],
  errorMessage?: string
): Promise<void> {
  const db = getDb();
  const sessionId = getSessionId();
  await db.execute({
    sql: `INSERT INTO send_log (session_id, target_id, content_id, status, error_message)
          VALUES (?, ?, ?, ?, ?)`,
    args: [sessionId, targetId, contentId, status, errorMessage ?? null],
  });
}

export async function getSendLogs(limit = 50): Promise<
  (SendLog & { target_name: string })[]
> {
  const db = getDb();
  const sessionId = getSessionId();
  const result = await db.execute({
    sql: `
      SELECT sl.*, t.name as target_name
      FROM send_log sl
      JOIN targets t ON sl.target_id = t.id
      WHERE sl.session_id = ?
      ORDER BY sl.sent_at DESC
      LIMIT ?
    `,
    args: [sessionId, limit],
  });
  return result.rows as unknown as (SendLog & { target_name: string })[];
}
