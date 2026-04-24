import { AuthenticationState, initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import { getDb } from "../db/client.js";

export const useTursoAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
  const db = getDb();

  // 1. Fetch creds
  let creds: any;
  const credsRow = await db.execute({
    sql: "SELECT data FROM auth_state WHERE session_id = ? AND key_id = 'creds'",
    args: [sessionId],
  });

  if (credsRow.rows.length > 0) {
    creds = JSON.parse(credsRow.rows[0].data as string, BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          
          await Promise.all(
            ids.map(async (id) => {
              let value: any = null;
              const key = `${type}-${id}`;
              const row = await db.execute({
                sql: "SELECT data FROM auth_state WHERE session_id = ? AND key_id = ?",
                args: [sessionId, key],
              });
              
              if (row.rows.length > 0) {
                value = JSON.parse(row.rows[0].data as string, BufferJSON.reviver);
              }
              
              if (value) {
                data[id] = value;
              }
            })
          );
          
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
                  queries.push({
                    sql: `INSERT INTO auth_state (session_id, key_id, data) 
                          VALUES (?, ?, ?) 
                          ON CONFLICT(session_id, key_id) DO UPDATE SET data = excluded.data`,
                    args: [sessionId, key, JSON.stringify(value, BufferJSON.replacer)],
                  });
                } else {
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
    saveCreds: async () => {
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
    },
  };
};
