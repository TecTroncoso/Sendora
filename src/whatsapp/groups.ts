import { getSocket } from "./connection.js";

export interface Group {
  jid: string;
  name: string;
  participantCount: number;
  isAdmin: boolean;
}

/**
 * Obtiene todos los grupos en los que participamos.
 * Usa groupFetchAllParticipating() de Baileys.
 */
export async function getGroups(): Promise<Group[]> {
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

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}
