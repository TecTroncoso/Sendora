import express from "express";
import cors from "cors";
import path from "path";
import { getTargets, logSend } from "../db/repository.js";
import { sendMixedContent } from "../whatsapp/sender.js";
import { getSocket, isConnected } from "../whatsapp/connection.js";

const app = express();
app.use(cors());
app.use(express.json());

// Servir la UI estática
app.use(express.static(path.join(process.cwd(), "public")));

// API: Obtener destinos
app.get("/api/targets", async (req, res) => {
  try {
    const targets = await getTargets(true);
    res.json(targets);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Enviar mensaje manual
app.post("/api/send", async (req, res) => {
  const { targetId, targetJid, text, filePaths } = req.body;
  if (!targetJid) {
    res.status(400).json({ error: "Falta targetJid" });
    return;
  }

  try {
    await sendMixedContent(targetJid, text, filePaths || []);
    if (targetId) {
      await logSend(targetId, null, "sent");
    }
    res.json({ success: true });
  } catch (error) {
    if (targetId) {
      await logSend(targetId, null, "failed", String(error));
    }
    res.status(500).json({ error: String(error) });
  }
});

// API: Estado del bot
app.get("/api/status", (req, res) => {
  try {
    if (isConnected()) {
      const sock = getSocket();
      res.json({ connected: true, user: sock.user });
    } else {
      res.json({ connected: false });
    }
  } catch(error) {
    res.json({ connected: false });
  }
});

// API: Iniciar Autenticación desde Web
app.post("/api/auth/start", async (req, res) => {
  const { authMode, phoneNumber } = req.body;
  if (!authMode) return res.status(400).json({ error: "Falta authMode" });
  
  try {
    const { connectWhatsApp } = await import("../whatsapp/connection.js");
    // Esto se lanza de fondo, los eventos se mandan por SSE
    connectWhatsApp(authMode as any, phoneNumber).catch(err => {
      console.error("Error al conectar WhatsApp desde Web:", err);
    });
    res.json({ success: true, message: "Conexión iniciada. Escuchando eventos SSE..." });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Server-Sent Events para estado de conexión
app.get("/api/auth/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { authEvents } = await import("../whatsapp/connection.js");

  const sendEvent = (event: string, data?: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`);
  };

  if (isConnected()) {
    sendEvent("connected");
  }

  const onQr = (qr: string) => sendEvent("qr", { qr });
  const onPairing = (code: string) => sendEvent("pairing_code", { code });
  const onConnected = () => sendEvent("connected");
  const onClosed = (data: any) => sendEvent("close", data);
  const onError = (error: any) => sendEvent("error", { message: String(error) });

  authEvents.on("qr", onQr);
  authEvents.on("pairing_code", onPairing);
  authEvents.on("connected", onConnected);
  authEvents.on("close", onClosed);
  authEvents.on("error", onError);

  req.on("close", () => {
    authEvents.off("qr", onQr);
    authEvents.off("pairing_code", onPairing);
    authEvents.off("connected", onConnected);
    authEvents.off("close", onClosed);
    authEvents.off("error", onError);
  });
});

export function startWebServer(port: number = 3000) {
  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`\n🌐 Web UI iniciada en http://localhost:${port}\n`);
      resolve();
    });
  });
}
