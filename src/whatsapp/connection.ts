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
import { config } from "../config/env.js";
import { getSessionId } from "../config/session.js";
import { useTursoAuthState } from "./authState.js";

export type AuthMode = "qr" | "pairing";

let sock: WASocket | null = null;

// Silenciar logs de Baileys para mantener la consola limpia
const logger = pino({ level: "silent" });

export function getSocket(): WASocket {
  if (!sock) {
    throw new Error("WhatsApp no está conectado. Llamá a connectWhatsApp() primero.");
  }
  return sock;
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
      console.log(`Usando WhatsApp Web v${version.join(".")} (¿Es la última? ${isLatest})`);

      sock = makeWASocket({
        auth: state,
        logger,
        version,
        browser: Browsers.ubuntu("Chrome"),
      });

      // Registrar listeners INMEDIATAMENTE después de crear el socket
      // ANTES de cualquier otra cosa, para no perder eventos
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        // Mostrar QR code cuando llega
        if (qr && authMode === "qr") {
          console.log("\n📱 Escaneá este QR code desde WhatsApp:\n");
          QRCode.generate(qr, { small: true });
          console.log("\n   WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo\n");
        }

        if (connection === "close") {
          const boomError = lastDisconnect?.error as Boom;
          const statusCode = boomError?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`\n❌ Conexión cerrada. Status: ${statusCode}, Error:`, boomError?.message);

          if (shouldReconnect) {
            console.log("🔄 Reconectando en 3 segundos...\n");
            // Esperar 3 segundos antes de reconectar para evitar loop infinito
            setTimeout(() => {
              connectWhatsApp(authMode, phoneNumber).then(resolve).catch(reject);
            }, 3000);
          } else {
            console.log(`🚪 Sesión cerrada para el usuario ${sessionId}.\n`);
            reject(new Error("Sesión cerrada por WhatsApp"));
          }
        } else if (connection === "open") {
          console.log(`✅ Conectado a WhatsApp exitosamente [Sesión: ${sessionId}]\n`);
          resolve(sock!);
        }
      });

      // Si es pairing code y no está registrado, pedir código
      if (authMode === "pairing" && !sock.authState.creds.registered) {
        if (!phoneNumber) {
          reject(new Error("Se necesita número de teléfono para pairing code"));
          return;
        }
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n🔑 Tu código de emparejamiento: ${code}\n`);
        console.log("Ingresá este código en WhatsApp > Dispositivos vinculados > Vincular dispositivo\n");
      }
    } catch (error) {
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
