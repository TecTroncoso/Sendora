import type { WASocket } from "@whiskeysockets/baileys";
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
 * 
 * IMPORTANTE: Recibe el socket directamente para poder registrar
 * los event handlers ANTES de que la conexión se abra.
 * Baileys dispara messaging-history.set durante el handshake,
 * si registramos después de "open", perdemos los eventos.
 */
export function initContactsListener(sock: WASocket): void {
  // ══════════════════════════════════════════════════════
  // PASO 1: Registrar listeners SINCRÓNICAMENTE (inmediato)
  // No usar await antes de esto — los eventos pueden llegar en cualquier momento
  // ══════════════════════════════════════════════════════

  // Sync inicial: messaging-history.set trae contactos y chats en bulk
  sock.ev.on("messaging-history.set", ({ contacts, chats }) => {
    let inserted = false;

    if (contacts) {
      for (const contact of contacts) {
        if (contact.id && !contact.id.endsWith("@g.us") && !contact.id.includes("newsletter") && contact.id !== "status@broadcast") {
          contactsMap.set(contact.id, {
            jid: contact.id,
            name: contact.notify ?? contact.name ?? contact.verifiedName ?? contact.id.split("@")[0],
            number: contact.id.split("@")[0],
          });
          inserted = true;
        }
      }
    }

    // Extraer contactos de los chats (útil como fallback)
    if (chats) {
      for (const chat of chats) {
        if (chat.id && !chat.id.endsWith("@g.us") && !chat.id.includes("newsletter") && chat.id !== "status@broadcast") {
          if (!contactsMap.has(chat.id)) {
            contactsMap.set(chat.id, {
              jid: chat.id,
              name: chat.name ?? chat.id.split("@")[0],
              number: chat.id.split("@")[0],
            });
            inserted = true;
          }
        }
      }
    }

    if (inserted) {
      console.log(`📇 ${contactsMap.size} contactos sincronizados`);
      
      if (!firstSyncDone) {
        firstSyncDone = true;
        saveContacts(true);
      } else {
        saveContacts();
      }
    }

    // Resolver siempre que llegue el evento
    if (syncResolver) {
      syncResolver();
      syncResolver = null;
    }
  });

  // Extraer contactos de chats nuevos o actualizados
  sock.ev.on("chats.upsert", (chats) => {
    let inserted = false;
    for (const chat of chats) {
      if (chat.id && !chat.id.endsWith("@g.us") && !chat.id.includes("newsletter") && chat.id !== "status@broadcast") {
        if (!contactsMap.has(chat.id) || chat.name) {
          const existing = contactsMap.get(chat.id);
          contactsMap.set(chat.id, {
            jid: chat.id,
            name: chat.name ?? existing?.name ?? chat.id.split("@")[0],
            number: chat.id.split("@")[0],
          });
          inserted = true;
        }
      }
    }
    if (inserted) {
      saveContacts();
    }
  });

  // Actualizaciones incrementales de contactos
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

  // ══════════════════════════════════════════════════════
  // PASO 2: Cargar caché en background (no bloquea los listeners)
  // ══════════════════════════════════════════════════════
  loadContacts().catch((err) =>
    console.error("Error cargando caché de contactos:", err)
  );
}

/**
 * Espera a que llegue el primer batch de contactos de WhatsApp.
 * Si ya hay contactos (caché o sync), resuelve inmediatamente.
 * Timeout de 15 segundos para no bloquear indefinidamente.
 */
export function waitForSync(timeoutMs = 15000): Promise<void> {
  if (contactsMap.size > 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    syncResolver = resolve;
    setTimeout(() => {
      if (syncResolver) {
        console.log(`⚠️  Timeout de sincronización (${timeoutMs / 1000}s) — continuando sin contactos`);
        syncResolver = null;
        resolve();
      }
    }, timeoutMs);
  });
}

export function getContacts(): Contact[] {
  return Array.from(contactsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
