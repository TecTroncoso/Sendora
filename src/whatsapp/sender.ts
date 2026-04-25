import { readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { basename } from "path";
import { getSocket } from "./connection.js";
import { config } from "../config/env.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Umbral para usar streaming en lugar de cargar en memoria (10MB)
const STREAM_THRESHOLD_BYTES = 10 * 1024 * 1024;

/**
 * Lee un archivo de forma inteligente:
 * - < 10MB: Buffer (rápido, bajo overhead)
 * - >= 10MB: ReadStream (no carga todo en RAM)
 */
async function smartRead(filePath: string): Promise<Buffer | ReturnType<typeof createReadStream>> {
  const fileStat = await stat(filePath);
  if (fileStat.size >= STREAM_THRESHOLD_BYTES) {
    console.log(`📂 Archivo grande (${(fileStat.size / 1024 / 1024).toFixed(1)}MB) — usando streaming`);
    return createReadStream(filePath);
  }
  return readFile(filePath);
}

/**
 * Envía un mensaje de texto.
 */
export async function sendTextMessage(jid: string, text: string): Promise<void> {
  const sock = getSocket();
  await sock.sendMessage(jid, { text });
}

/**
 * Envía una imagen con caption opcional.
 */
export async function sendImageMessage(
  jid: string,
  imagePath: string,
  caption?: string
): Promise<void> {
  const sock = getSocket();
  const imageData = await smartRead(imagePath);
  await sock.sendMessage(jid, {
    image: imageData as any,
    caption: caption ?? undefined,
    mimetype: getMimeType(imagePath),
  });
}

/**
 * Envía un video con caption opcional.
 */
export async function sendVideoMessage(
  jid: string,
  videoPath: string,
  caption?: string
): Promise<void> {
  const sock = getSocket();
  const videoData = await smartRead(videoPath);
  await sock.sendMessage(jid, {
    video: videoData as any,
    caption: caption ?? undefined,
    mimetype: getMimeType(videoPath),
  });
}

/**
 * Envía un documento/archivo.
 */
export async function sendDocumentMessage(
  jid: string,
  filePath: string,
  filename?: string
): Promise<void> {
  const sock = getSocket();
  const docData = await smartRead(filePath);
  await sock.sendMessage(jid, {
    document: docData as any,
    fileName: filename ?? basename(filePath),
    mimetype: getMimeType(filePath),
  });
}

/**
 * Envía una mezcla de archivos y texto secuencialmente.
 * Asocia el texto como caption al primer archivo multimedia (imagen o video) si existe.
 * Si no hay multimedia o quedan textos sin enviar, lo manda como mensaje de texto.
 */
export async function sendMixedContent(
  jid: string,
  text?: string,
  filePaths?: string[]
): Promise<void> {
  let textSent = false;

  if (filePaths && filePaths.length > 0) {
    for (const path of filePaths) {
      const mimeType = getMimeType(path);
      const isMedia = mimeType.startsWith("image/") || mimeType.startsWith("video/");

      let caption: string | undefined = undefined;
      if (isMedia && text && !textSent) {
        caption = text;
        textSent = true;
      }

      if (mimeType.startsWith("image/")) {
        await sendImageMessage(jid, path, caption);
      } else if (mimeType.startsWith("video/")) {
        await sendVideoMessage(jid, path, caption);
      } else {
        await sendDocumentMessage(jid, path);
      }

      // Delay optimizado entre archivos al MISMO destinatario (800ms)
      await delay(config.scheduler.interFileDelayMs);
    }
  }

  // Si había texto pero no se envió (ej: porque solo eran documentos o no había archivos)
  if (text && !textSent) {
    await sendTextMessage(jid, text);
    await delay(config.scheduler.interFileDelayMs);
  }
}

/**
 * Envía un mensaje con rate limiting.
 * Usa un delay configurable entre envíos para evitar bans.
 */
export async function sendWithRateLimit(
  jid: string,
  sendFn: () => Promise<void>
): Promise<void> {
  await sendFn();
  await delay(config.scheduler.rateLimitDelayMs);
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    txt: "text/plain",
  };
  return mimeTypes[ext ?? ""] ?? "application/octet-stream";
}
