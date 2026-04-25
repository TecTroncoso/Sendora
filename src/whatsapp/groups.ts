import { getSocket } from "./connection.js";

export interface Group {
  jid: string;
  name: string;
  participantCount: number;
  isAdmin: boolean;
}

// ═══ CACHE CON TTL ═══
const GROUPS_TTL_MS = 5 * 60 * 1000; // 5 minutos
let cachedGroups: Group[] | null = null;
let cacheTimestamp = 0;

/**
 * Obtiene todos los grupos en los que participamos.
 * Usa caché en memoria con TTL de 5 minutos para evitar
 * llamadas repetidas a groupFetchAllParticipating().
 */
export async function getGroups(forceRefresh = false): Promise<Group[]> {
  const now = Date.now();

  // Devolver cache si es válido
  if (!forceRefresh && cachedGroups && (now - cacheTimestamp) < GROUPS_TTL_MS) {
    return cachedGroups;
  }

  const sock = getSocket();
  const groupsMetadata = await sock.groupFetchAllParticipating();

  const myJid = sock.user?.id;
  const groups: Group[] = [];

  for (const [jid, metadata] of Object.entries(groupsMetadata)) {
    const meAsParticipant = metadata.participants.find(
      (p) => p.id === myJid || p.id.split(":")[0] === myJid?.split(":")[0]
    );

    groups.push({
      jid,
      name: metadata.subject ?? jid,
      participantCount: metadata.participants.length,
      isAdmin:
        meAsParticipant?.admin === "admin" ||
        meAsParticipant?.admin === "superadmin",
    });
  }

  cachedGroups = groups.sort((a, b) => a.name.localeCompare(b.name));
  cacheTimestamp = now;

  return cachedGroups;
}

/** Invalida la caché manualmente (útil si el usuario sabe que cambió algo) */
export function invalidateGroupsCache(): void {
  cachedGroups = null;
  cacheTimestamp = 0;
}
