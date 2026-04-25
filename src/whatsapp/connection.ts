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
let isConnecting = false;
let lastQr: string | null = null;
let lastPairingCode: string | null = null;
export const authEvents = new EventEmitter();

// Silenciar logs de Baileys para mantener la consola limpia
const logger = pino({ level: "silent" });

// ═══ BAILEYS VERSION CACHE (TTL: 1 hora) ═══
let cachedVersion: [number, number, number] | null = null;
let versionCacheTime = 0;
const VERSION_TTL_MS = 60 * 60 * 1000;

async function getCachedVersion(): Promise<[number, number, number]> {
  const now = Date.now();
  if (cachedVersion && (now - versionCacheTime) < VERSION_TTL_MS) {
    return cachedVersion;
  }
  const { version } = await fetchLatestBaileysVersion();
  cachedVersion = version;
  versionCacheTime = now;
  return version;
}

export function getSocket(): WASocket {
  if (!sock) {
    throw new Error("WhatsApp no está conectado. Llamá a connectWhatsApp() primero.");
  }
  return sock;
}

export function isConnected(): boolean {
  return !!sock;
}

export function getLastQr(): string | null {
  return lastQr;
}

export function getLastPairingCode(): string | null {
  return lastPairingCode;
}

export function connectWhatsApp(
  authMode: AuthMode,
  phoneNumber?: string,
  onSocketCreated?: (sock: WASocket) => void
): Promise<WASocket> {
  if (sock || isConnecting) {
    return Promise.reject(new Error("Ya hay una conexión en curso o activa"));
  }
  isConnecting = true;
  return new Promise(async (resolve, reject) => {
    try {
      const sessionId = getSessionId();
      const { state, saveCreds } = await useTursoAuthState(sessionId);
      
      const version = await getCachedVersion();
      console.log(`⚡ Iniciando conexión (v${version.join(".")})`);

      sock = makeWASocket({
        auth: state,
        logger,
        version,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: true,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });

      // Permitir que el caller registre listeners ANTES de que la conexión abra
      // Esto es CRÍTICO: Baileys dispara messaging-history.set durante el handshake,
      // si esperamos a que la conexión abra, los eventos se pierden.
      if (onSocketCreated) {
        onSocketCreated(sock);
      }

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && authMode === "qr") {
          lastQr = qr;
          console.log("\n📱 Escaneá este QR code desde WhatsApp:\n");
          QRCode.generate(qr, { small: true });
          console.log("\n   WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo\n");
          authEvents.emit("qr", qr);
        }

        if (connection === "close") {
          isConnecting = false;
          sock = null;
          lastQr = null;
          lastPairingCode = null;
          
          const boomError = lastDisconnect?.error as Boom;
          const statusCode = boomError?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`\n❌ Conexión cerrada. Status: ${statusCode}, Error:`, boomError?.message);
          authEvents.emit("close", { shouldReconnect, error: boomError?.message });

          if (shouldReconnect) {
            console.log("🔄 Reconectando en 3 segundos...\n");
            setTimeout(() => {
              connectWhatsApp(authMode, phoneNumber, onSocketCreated).then(resolve).catch(reject);
            }, 3000);
          } else {
            console.log(`🚪 Sesión cerrada para el usuario ${sessionId}.\n`);
            reject(new Error("Sesión cerrada por WhatsApp"));
          }
        } else if (connection === "open") {
          isConnecting = false;
          lastQr = null;
          lastPairingCode = null;
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
            lastPairingCode = code;
            console.log(`\n🔑 Tu código de emparejamiento: ${code}\n`);
            console.log("Ingresá este código en WhatsApp > Dispositivos vinculados > Vincular dispositivo\n");
            authEvents.emit("pairing_code", code);
          } catch(err) {
            authEvents.emit("error", err);
          }
        }, 3000);
      }
    } catch (error) {
      isConnecting = false;
      sock = null;
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
