import makeWASocket, {
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode-terminal";
import { EventEmitter } from "events";
import { config } from "../config/env.js";
import { getSessionId } from "../config/session.js";
import { useTursoAuthState } from "./authState.js";

export type AuthMode = "qr" | "pairing";

let sock: WASocket | null = null;
export const authEvents = new EventEmitter();

// Silenciar logs de Baileys para mantener la consola limpia
const logger = pino({ level: "silent" });

export function getSocket(): WASocket {
  if (!sock) {
    throw new Error("WhatsApp no está conectado. Llamá a connectWhatsApp() primero.");
  }
  return sock;
}

export function isConnected(): boolean {
  return !!sock;
}

export function connectWhatsApp(
  authMode: AuthMode,
  phoneNumber?: string
): Promise<WASocket> {
  return new Promise(async (resolve, reject) => {
    try {
      const sessionId = getSessionId();
      const { state, saveCreds } = await useTursoAuthState(sessionId);
      
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`⚡ Iniciando conexión ultra-rápida (v${version.join(".")} - Latest: ${isLatest})`);

      sock = makeWASocket({
        auth: state,
        logger,
        version,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && authMode === "qr") {
          console.log("\n📱 Escaneá este QR code desde WhatsApp:\n");
          QRCode.generate(qr, { small: true });
          console.log("\n   WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo\n");
          authEvents.emit("qr", qr);
        }

        if (connection === "close") {
          const boomError = lastDisconnect?.error as Boom;
          const statusCode = boomError?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`\n❌ Conexión cerrada. Status: ${statusCode}, Error:`, boomError?.message);
          authEvents.emit("close", { shouldReconnect, error: boomError?.message });

          if (shouldReconnect) {
            console.log("🔄 Reconectando en 3 segundos...\n");
            setTimeout(() => {
              connectWhatsApp(authMode, phoneNumber).then(resolve).catch(reject);
            }, 3000);
          } else {
            console.log(`🚪 Sesión cerrada para el usuario ${sessionId}.\n`);
            reject(new Error("Sesión cerrada por WhatsApp"));
          }
        } else if (connection === "open") {
          console.log(`✅ Conectado a WhatsApp exitosamente [Sesión: ${sessionId}]\n`);
          authEvents.emit("connected");
          resolve(sock!);
        }
      });

      if (authMode === "pairing" && !sock.authState.creds.registered) {
        if (!phoneNumber) {
          reject(new Error("Se necesita número de teléfono para pairing code"));
          return;
        }
        // Agregamos un delay pequeño antes de pedir el code
        setTimeout(async () => {
          try {
            const code = await sock!.requestPairingCode(phoneNumber);
            console.log(`\n🔑 Tu código de emparejamiento: ${code}\n`);
            console.log("Ingresá este código en WhatsApp > Dispositivos vinculados > Vincular dispositivo\n");
            authEvents.emit("pairing_code", code);
          } catch(err) {
            authEvents.emit("error", err);
          }
        }, 3000);
      }
    } catch (error) {
      authEvents.emit("error", error);
      reject(error);
    }
  });
}

export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
  }
}
