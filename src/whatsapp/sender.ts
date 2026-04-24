import { readFile } from "fs/promises";
import { basename } from "path";
import { getSocket } from "./connection.js";
import { config } from "../config/env.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const imageBuffer = await readFile(imagePath);
  await sock.sendMessage(jid, {
    image: imageBuffer,
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
  const videoBuffer = await readFile(videoPath);
  await sock.sendMessage(jid, {
    video: videoBuffer,
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
  const docBuffer = await readFile(filePath);
  await sock.sendMessage(jid, {
    document: docBuffer,
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

      // Pequeño delay entre envíos para que lleguen en orden y no saturen WhatsApp
      await delay(1500); 
    }
  }

  // Si había texto pero no se envió (ej: porque solo eran documentos o no había archivos)
  if (text && !textSent) {
    await sendTextMessage(jid, text);
    await delay(1500);
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
  await delay(config.scheduler.defaultDelayMs);
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
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
    txt: "text/plain",
  };
  return mimeTypes[ext ?? ""] ?? "application/octet-stream";
}
