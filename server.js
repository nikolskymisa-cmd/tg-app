import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// Раздаём public/*
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const BOT_TOKEN = process.env.BOT_TOKEN || "";       // пока может быть пустой локально
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// --- Проверка initData от Telegram ---
function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const ok = crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
  if (!ok) return { ok: false, error: "bad hash" };

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  const auth_date = Number(params.get("auth_date") || 0);

  return { ok: true, user, auth_date };
}

app.post("/auth/telegram", (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData required" });

  // Если ты открыл страницу НЕ из Telegram — initData будет пустой/невалидной
  if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set on server" });

  const v = verifyTelegramInitData(initData);
  if (!v.ok) return res.status(401).json({ error: v.error });

  // Простейшая проверка "свежести" (24 часа)
  const now = Math.floor(Date.now() / 1000);
  if (v.auth_date && now - v.auth_date > 86400) {
    return res.status(401).json({ error: "initData expired" });
  }

  const telegramId = v.user?.id;
  const token = jwt.sign({ telegramId }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token });
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "bad token" });
  }
}

app.get("/me", auth, (req, res) => {
  res.json({
    telegramId: req.user.telegramId,
    status: "active",
    plan: "demo"
  });
});

app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Started on http://localhost:" + PORT);
});