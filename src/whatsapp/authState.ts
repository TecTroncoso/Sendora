import { AuthenticationState, initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import { getDb } from "../db/client.js";

export const hasValidSession = async (sessionId: string): Promise<boolean> => {
  const db = getDb();
  const credsRow = await db.execute({
    sql: "SELECT data FROM auth_state WHERE session_id = ? AND key_id = 'creds'",
    args: [sessionId],
  });
  if (credsRow.rows.length > 0) {
    const creds = JSON.parse(credsRow.rows[0].data as string, BufferJSON.reviver);
    return !!creds.registered;
  }
  return false;
};

export const useTursoAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
  const db = getDb();

  // ═══ IN-MEMORY CACHE ═══
  // Pre-cargamos TODAS las keys al inicio para evitar round-trips a Turso
  const keyCache = new Map<string, any>();

  // Bulk-load: traer todas las keys de la sesión de una sola vez
  const allKeys = await db.execute({
    sql: "SELECT key_id, data FROM auth_state WHERE session_id = ?",
    args: [sessionId],
  });

  for (const row of allKeys.rows) {
    const keyId = row.key_id as string;
    try {
      keyCache.set(keyId, JSON.parse(row.data as string, BufferJSON.reviver));
    } catch {
      // Si algún dato está corrupto, lo ignoramos
    }
  }

  console.log(`🔑 Auth cache: ${keyCache.size} keys pre-cargadas en memoria`);

  // 1. Fetch creds (desde cache o init)
  let creds: any = keyCache.get("creds") ?? initAuthCreds();

  // ═══ DEBOUNCED SAVE CREDS ═══
  let credsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveCreds = async () => {
    if (credsTimer) clearTimeout(credsTimer);
    // Actualizar cache inmediatamente
    keyCache.set("creds", creds);

    credsTimer = setTimeout(async () => {
      try {
        await db.execute({
          sql: `INSERT INTO auth_state (session_id, key_id, data) 
                VALUES (?, 'creds', ?) 
                ON CONFLICT(session_id, key_id) DO UPDATE SET data = excluded.data`,
          args: [sessionId, JSON.stringify(creds, BufferJSON.replacer)],
        });
      } catch (error) {
        console.error("❌ Error en AuthState.saveCreds:", error);
      }
    }, 500);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          if (ids.length === 0) return data;

          // ═══ READ FROM CACHE (zero latency) ═══
          let cacheMisses: string[] = [];

          for (const id of ids) {
            const cacheKey = `${type}-${id}`;
            const cached = keyCache.get(cacheKey);
            if (cached !== undefined) {
              data[id] = cached;
            } else {
              cacheMisses.push(id);
            }
          }

          // Si hay cache misses, ir a Turso y actualizar cache
          if (cacheMisses.length > 0) {
            try {
              const keys = cacheMisses.map((id) => `${type}-${id}`);
              const placeholders = keys.map(() => "?").join(",");

              const result = await db.execute({
                sql: `SELECT key_id, data FROM auth_state WHERE session_id = ? AND key_id IN (${placeholders})`,
                args: [sessionId, ...keys],
              });

              for (const row of result.rows) {
                const keyId = row.key_id as string;
                const id = keyId.replace(`${type}-`, "");
                const value = JSON.parse(row.data as string, BufferJSON.reviver);
                if (value) {
                  data[id] = value;
                  keyCache.set(keyId, value); // Write to cache
                }
              }
            } catch (error) {
              console.error("❌ Error en AuthState.get (cache miss):", error);
            }
          }

          return data;
        },
        set: async (data) => {
          try {
            const queries = [];

            for (const category of Object.keys(data)) {
              const categoryData = data[category as keyof typeof data];
              if (!categoryData) continue;

              for (const id of Object.keys(categoryData)) {
                const value = categoryData[id as keyof typeof categoryData];
                const key = `${category}-${id}`;

                if (value) {
                  // ═══ WRITE-THROUGH: cache + DB ═══
                  keyCache.set(key, value);
                  queries.push({
                    sql: `INSERT INTO auth_state (session_id, key_id, data) 
                          VALUES (?, ?, ?) 
                          ON CONFLICT(session_id, key_id) DO UPDATE SET data = excluded.data`,
                    args: [sessionId, key, JSON.stringify(value, BufferJSON.replacer)],
                  });
                } else {
                  keyCache.delete(key);
                  queries.push({
                    sql: "DELETE FROM auth_state WHERE session_id = ? AND key_id = ?",
                    args: [sessionId, key],
                  });
                }
              }
            }

            if (queries.length > 0) {
              await db.batch(queries, "write");
            }
          } catch (error) {
            console.error("❌ Error en AuthState.set:", error);
          }
        },
      },
    },
    saveCreds: debouncedSaveCreds,
  };
};
