import type { WASocket } from "@whiskeysockets/baileys";
import { getDb } from "../db/client.js";
import { getSessionId } from "../config/session.js";

export interface Channel {
  jid: string;
  name: string;
}

// Almacén en memoria de canales/newsletters
const channelsMap = new Map<string, Channel>();

async function loadChannels(): Promise<void> {
  try {
    const db = getDb();
    const sessionId = getSessionId();
    const row = await db.execute({
      sql: "SELECT data FROM whatsapp_cache WHERE session_id = ? AND type = 'channels'",
      args: [sessionId],
    });

    if (row.rows.length > 0) {
      const parsed = JSON.parse(row.rows[0].data as string);
      for (const [jid, channel] of Object.entries(parsed)) {
        channelsMap.set(jid, channel as Channel);
      }
      if (channelsMap.size > 0) {
        console.log(`📢 ${channelsMap.size} canales cargados desde caché`);
      }
    }
  } catch (error) {
    console.error("Error leyendo canales desde Turso:", error);
  }
}

let saveChannelsTimeout: NodeJS.Timeout | null = null;
let firstChannelSyncDone = false;

async function saveChannels(immediate = false) {
  if (saveChannelsTimeout) clearTimeout(saveChannelsTimeout);

  const doSave = async () => {
    try {
      const db = getDb();
      const sessionId = getSessionId();
      const data = Object.fromEntries(channelsMap);
      await db.execute({
        sql: `INSERT INTO whatsapp_cache (session_id, type, data) 
              VALUES (?, 'channels', ?) 
              ON CONFLICT(session_id, type) DO UPDATE SET data = excluded.data`,
        args: [sessionId, JSON.stringify(data)],
      });
    } catch (error) {
      console.error("Error guardando canales en Turso:", error);
    }
  };

  if (immediate) {
    await doSave();
  } else {
    saveChannelsTimeout = setTimeout(doSave, 3000);
  }
}

/**
 * Inicializa listener para capturar newsletters del historial.
 * Recibe el socket directamente para registrar ANTES de que la conexión abra.
 */
export function initChannelsListener(sock: WASocket): void {
  // Registrar listeners SINCRÓNICAMENTE (sin await previo)

  sock.ev.on("messaging-history.set", ({ chats }) => {
    if (chats) {
      for (const chat of chats) {
        if (chat.id?.includes("@newsletter")) {
          channelsMap.set(chat.id, {
            jid: chat.id,
            name: chat.name ?? chat.id.split("@")[0],
          });
        }
      }
      if (channelsMap.size > 0) {
        console.log(`📢 ${channelsMap.size} canales/newsletters sincronizados`);
        if (!firstChannelSyncDone) {
          firstChannelSyncDone = true;
          saveChannels(true);
        } else {
          saveChannels();
        }
      }
    }
  });

  // Actualizaciones de chats también pueden traer newsletters
  sock.ev.on("chats.upsert", (chats) => {
    let updated = false;
    for (const chat of chats) {
      if (chat.id?.includes("@newsletter")) {
        channelsMap.set(chat.id, {
          jid: chat.id,
          name: chat.name ?? chat.id.split("@")[0],
        });
        updated = true;
      }
    }
    if (updated) {
      saveChannels();
    }
  });

  // Cargar caché en background
  loadChannels().catch((err) =>
    console.error("Error cargando caché de canales:", err)
  );
}

export function getChannels(): Channel[] {
  return Array.from(channelsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
