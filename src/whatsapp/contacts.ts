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
let firstSyncDone = false;

async function loadContacts(): Promise<void> {
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
      if (contactsMap.size > 0) {
        console.log(`📇 ${contactsMap.size} contactos cargados desde caché`);
        firstSyncDone = true;
      }
    }
  } catch (error) {
    console.error("Error leyendo contactos desde Turso:", error);
  }
}

let saveContactsTimeout: NodeJS.Timeout | null = null;

/**
 * Guarda contactos en Turso. 
 * immediate=true para el primer sync (no debounce), false para updates incrementales.
 */
async function saveContacts(immediate = false) {
  if (saveContactsTimeout) clearTimeout(saveContactsTimeout);

  const doSave = async () => {
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
  };

  if (immediate) {
    await doSave();
  } else {
    saveContactsTimeout = setTimeout(doSave, 3000);
  }
}

// Resolvers para waitForSync()
let syncResolver: (() => void) | null = null;

/**
 * Inicializa los listeners de contactos.
 * Llamar DESPUÉS de conectar. Espera a que la caché se cargue.
 */
export async function initContactsListener(): Promise<void> {
  const sock = getSocket();
  
  // Cargar caché ANTES de registrar listeners (awaited)
  await loadContacts();

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
      
      // Primer sync: guardar INMEDIATAMENTE (sin debounce)
      if (!firstSyncDone) {
        firstSyncDone = true;
        saveContacts(true);
      } else {
        saveContacts();
      }

      // Resolver la promesa de waitForSync si alguien está esperando
      if (syncResolver) {
        syncResolver();
        syncResolver = null;
      }
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

  // Nuevos contactos agregados en tiempo real
  sock.ev.on("contacts.upsert", (contacts) => {
    let inserted = false;
    for (const contact of contacts) {
      if (contact.id && !contact.id.endsWith("@g.us") && !contact.id.includes("newsletter")) {
        contactsMap.set(contact.id, {
          jid: contact.id,
          name: contact.notify ?? contact.name ?? contact.verifiedName ?? contact.id.split("@")[0],
          number: contact.id.split("@")[0],
        });
        inserted = true;
      }
    }
    if (inserted) {
      saveContacts();
    }
  });
}

/**
 * Espera a que llegue el primer batch de contactos de WhatsApp.
 * Si ya hay contactos en caché, resuelve inmediatamente.
 * Timeout de 8 segundos para no bloquear indefinidamente.
 */
export function waitForSync(timeoutMs = 8000): Promise<void> {
  if (contactsMap.size > 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    syncResolver = resolve;
    setTimeout(() => {
      if (syncResolver) {
        syncResolver = null;
        resolve(); // Timeout — seguimos sin contactos pero no bloqueamos
      }
    }, timeoutMs);
  });
}

export function getContacts(): Contact[] {
  return Array.from(contactsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
