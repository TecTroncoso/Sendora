import fs from "fs";
import path from "path";
import crypto from "crypto";

const SESSION_FILE = path.resolve(process.cwd(), ".bot_session");
let currentSessionId: string | null = null;

export function getSessionId(): string {
  if (currentSessionId) return currentSessionId;

  if (fs.existsSync(SESSION_FILE)) {
    currentSessionId = fs.readFileSync(SESSION_FILE, "utf-8").trim();
  } else {
    currentSessionId = `user_${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(SESSION_FILE, currentSessionId);
  }

  return currentSessionId;
}
