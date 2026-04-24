import { checkbox, confirm } from "@inquirer/prompts";
import { getContacts } from "../whatsapp/contacts.js";
import { getGroups } from "../whatsapp/groups.js";
import { getChannels } from "../whatsapp/channels.js";
import {
  addTargets,
  getTargets,
  toggleTarget,
  removeTarget,
  type Target,
} from "../db/repository.js";
import { select } from "@inquirer/prompts";

// ── Listar y seleccionar contactos ──────────────────────

export async function showContactsList(): Promise<void> {
  const contacts = getContacts();

  if (contacts.length === 0) {
    console.log("\n⏳ No hay contactos sincronizados aún.");
    console.log("   Esperá unos segundos a que WhatsApp sincronice el historial.\n");
    return;
  }

  console.log(`\n📇 ${contacts.length} contactos encontrados\n`);

  const selected = await checkbox({
    message: "Seleccioná contactos para automatizar (espacio para seleccionar, enter para confirmar):",
    choices: contacts.map((c) => ({
      name: `${c.name} (${c.number})`,
      value: c.jid,
    })),
    pageSize: 15,
  });

  if (selected.length === 0) {
    console.log("\nNo se seleccionó ningún contacto.\n");
    return;
  }

  const targets = selected.map((jid) => {
    const contact = contacts.find((c) => c.jid === jid)!;
    return { jid, name: contact.name, type: "contact" as const };
  });

  await addTargets(targets);
  console.log(`\n✅ ${targets.length} contacto(s) guardados como destinos\n`);
}

// ── Listar y seleccionar grupos ─────────────────────────

export async function showGroupsList(): Promise<void> {
  console.log("\n⏳ Cargando grupos...\n");
  const groups = await getGroups();

  if (groups.length === 0) {
    console.log("No se encontraron grupos.\n");
    return;
  }

  console.log(`👥 ${groups.length} grupos encontrados\n`);

  const selected = await checkbox({
    message: "Seleccioná grupos para automatizar:",
    choices: groups.map((g) => ({
      name: `${g.name} (${g.participantCount} miembros${g.isAdmin ? " 👑 Admin" : ""})`,
      value: g.jid,
    })),
    pageSize: 15,
  });

  if (selected.length === 0) {
    console.log("\nNo se seleccionó ningún grupo.\n");
    return;
  }

  const targets = selected.map((jid) => {
    const group = groups.find((g) => g.jid === jid)!;
    return { jid, name: group.name, type: "group" as const };
  });

  await addTargets(targets);
  console.log(`\n✅ ${targets.length} grupo(s) guardados como destinos\n`);
}

// ── Listar y seleccionar canales ────────────────────────

export async function showChannelsList(): Promise<void> {
  const channels = getChannels();

  if (channels.length === 0) {
    console.log("\n📢 No se encontraron canales/newsletters.");
    console.log("   Asegurate de estar suscrito a algún canal en WhatsApp.\n");
    return;
  }

  console.log(`\n📢 ${channels.length} canales encontrados\n`);

  const selected = await checkbox({
    message: "Seleccioná canales para automatizar:",
    choices: channels.map((ch) => ({
      name: ch.name,
      value: ch.jid,
    })),
    pageSize: 15,
  });

  if (selected.length === 0) {
    console.log("\nNo se seleccionó ningún canal.\n");
    return;
  }

  const targets = selected.map((jid) => {
    const channel = channels.find((ch) => ch.jid === jid)!;
    return { jid, name: channel.name, type: "channel" as const };
  });

  await addTargets(targets);
  console.log(`\n✅ ${targets.length} canal(es) guardados como destinos\n`);
}

// ── Ver destinos guardados ──────────────────────────────

export async function showSavedTargets(): Promise<void> {
  const targets = await getTargets();

  if (targets.length === 0) {
    console.log("\n📭 No hay destinos guardados aún.");
    console.log("   Usá las opciones de listar contactos/grupos/canales para agregar.\n");
    return;
  }

  console.log("\n✅ Destinos guardados:\n");

  const typeEmoji: Record<string, string> = {
    contact: "📇",
    group: "👥",
    channel: "📢",
  };

  for (const t of targets) {
    const status = t.active ? "🟢" : "🔴";
    console.log(
      `  ${status} ${typeEmoji[t.type] ?? "❓"} ${t.name} [${t.type}] ${!t.active ? "(pausado)" : ""}`
    );
  }
  console.log();

  const action = await select({
    message: "¿Qué querés hacer?",
    choices: [
      { name: "🔄 Activar/desactivar un destino", value: "toggle" },
      { name: "🗑️  Eliminar un destino", value: "remove" },
      { name: "⬅️  Volver al menú", value: "back" },
    ],
  });

  if (action === "toggle") {
    await toggleTargetUI(targets);
  } else if (action === "remove") {
    await removeTargetUI(targets);
  }
}

async function toggleTargetUI(targets: Target[]): Promise<void> {
  const targetId = await select({
    message: "Seleccioná destino para activar/desactivar:",
    choices: targets.map((t) => ({
      name: `${t.active ? "🟢" : "🔴"} ${t.name} [${t.type}]`,
      value: t.id,
    })),
  });

  await toggleTarget(targetId);
  console.log("✅ Estado actualizado\n");
}

async function removeTargetUI(targets: Target[]): Promise<void> {
  const targetId = await select({
    message: "Seleccioná destino para eliminar:",
    choices: targets.map((t) => ({
      name: `${t.name} [${t.type}]`,
      value: t.id,
    })),
  });

  const sure = await confirm({
    message: "¿Estás seguro? Se eliminará el destino y todo su contenido programado.",
    default: false,
  });

  if (sure) {
    await removeTarget(targetId);
    console.log("🗑️  Destino eliminado\n");
  }
}
