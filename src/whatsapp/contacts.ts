import { getSocket } from "./connection.js";
import { getDb } from "../db/client.js";
import { getSessionId } from "../config/session.js";

export interface Contact {
  jid: string;
  name: string;
  number: string;
}

// Almacén en memoria de contactos sincronizados
const contactsMap = new Map<string, Contact>();

async function loadContacts() {
  try {
    const db = getDb();
    const sessionId = getSessionId();
    const row = await db.execute({
      sql: "SELECT data FROM whatsapp_cache WHERE session_id = ? AND type = 'contacts'",
      args: [sessionId],
    });

    if (row.rows.length > 0) {
      const parsed = JSON.parse(row.rows[0].data as string);
      for (const [jid, contact] of Object.entries(parsed)) {
        contactsMap.set(jid, contact as Contact);
      }
      console.log(`📇 ${contactsMap.size} contactos cargados desde Turso`);
    }
  } catch (error) {
    console.error("Error leyendo contactos desde Turso:", error);
  }
}

async function saveContacts() {
  try {
    const db = getDb();
    const sessionId = getSessionId();
    const data = Object.fromEntries(contactsMap);
    await db.execute({
      sql: `INSERT INTO whatsapp_cache (session_id, type, data) 
            VALUES (?, 'contacts', ?) 
            ON CONFLICT(session_id, type) DO UPDATE SET data = excluded.data`,
      args: [sessionId, JSON.stringify(data)],
    });
  } catch (error) {
    console.error("Error guardando contactos en Turso:", error);
  }
}

/**
 * Inicializa los listeners de contactos.
 * Llamar DESPUÉS de conectar.
 */
export function initContactsListener(): void {
  const sock = getSocket();
  
  loadContacts();

  // Sync inicial: messaging-history.set trae contactos en bulk
  sock.ev.on("messaging-history.set", ({ contacts }) => {
    if (contacts) {
      for (const contact of contacts) {
        if (contact.id && !contact.id.endsWith("@g.us") && !contact.id.includes("newsletter")) {
          contactsMap.set(contact.id, {
            jid: contact.id,
            name: contact.notify ?? contact.name ?? contact.verifiedName ?? contact.id.split("@")[0],
            number: contact.id.split("@")[0],
          });
        }
      }
      console.log(`📇 ${contactsMap.size} contactos sincronizados`);
      saveContacts();
    }
  });

  // Actualizaciones incrementales
  sock.ev.on("contacts.update", (updates) => {
    let updated = false;
    for (const update of updates) {
      if (update.id && !update.id.endsWith("@g.us")) {
        const existing = contactsMap.get(update.id);
        contactsMap.set(update.id, {
          jid: update.id,
          name: update.notify ?? existing?.name ?? update.id.split("@")[0],
          number: update.id.split("@")[0],
        });
        updated = true;
      }
    }
    if (updated) {
      saveContacts();
    }
  });
}

export function getContacts(): Contact[] {
  return Array.from(contactsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
