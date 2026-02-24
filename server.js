import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import {
  getOrCreateUser,
  getVpnPackages,
  getPackageById,
  getUserSubscriptions,
  createTransaction,
  getUserById
} from "./db.js";
import './seed.js'; // Инициализируем БД

const app = express();
app.use(express.json());

// --- CORS ---
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// --- статика ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- конфиги ---
const BOT_TOKEN = config.BOT_TOKEN;
const JWT_SECRET = config.JWT_SECRET;

// --- verify initData ---
function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const ok = crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
  if (!ok) return { ok: false, error: "bad hash" };

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  const auth_date = Number(params.get("auth_date") || 0);
  return { ok: true, user, auth_date };
}

// --- endpoints ---
app.get("/health", (req, res) => res.send("OK"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/auth/telegram", (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData required" });
  if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set on server" });

  const v = verifyTelegramInitData(initData);
  if (!v.ok) return res.status(401).json({ error: v.error });

  const now = Math.floor(Date.now() / 1000);
  if (v.auth_date && now - v.auth_date > 86400) {
    return res.status(401).json({ error: "initData expired" });
  }

  const telegramId = v.user?.id;
  const user = getOrCreateUser(telegramId, v.user?.first_name, v.user?.username);
  const token = jwt.sign({ telegramId, userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user });
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
  const user = getUserById(req.user.userId);
  const subscriptions = getUserSubscriptions(req.user.userId);
  res.json({ 
    user,
    subscriptions,
    activePlan: subscriptions.length > 0 ? subscriptions[0].packageName : null
  });
});

// --- VPN API ---
app.get("/vpn/packages", (req, res) => {
  const packages = getVpnPackages();
  res.json(packages);
});

app.post("/vpn/purchase", auth, (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ error: "packageId required" });
    
    const pkg = getPackageById(packageId);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    
    const transactionId = createTransaction(req.user.userId, packageId, pkg.price);
    
    res.json({
      transactionId,
      package: pkg,
      message: "Payment required. Use /pay command in bot."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/vpn/subscriptions", auth, (req, res) => {
  const subscriptions = getUserSubscriptions(req.user.userId);
  res.json(subscriptions);
});

// --- start ---
const PORT = config.PORT;
app.listen(PORT, () => console.log("Started on " + PORT));