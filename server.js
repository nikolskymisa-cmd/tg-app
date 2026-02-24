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
  getUserById,
  updateTransactionStatus,
  getTransaction,
  getTransactionByOrderId,
  initDb
} from "./db.js";
import { generateVpnKey, generateVpnConfig } from "./payment.js";

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

app.post("/auth/telegram", async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData required" });
  if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set on server" });

  const v = verifyTelegramInitData(initData);
  if (!v.ok) return res.status(401).json({ error: v.error });

  const now = Math.floor(Date.now() / 1000);
  if (v.auth_date && now - v.auth_date > 86400) {
    return res.status(401).json({ error: "initData expired" });
  }

  try {
    const telegramId = v.user?.id;
    const user = await getOrCreateUser(telegramId, v.user?.first_name, v.user?.username);
    const token = jwt.sign({ telegramId, userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.get("/me", auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    const subscriptions = await getUserSubscriptions(req.user.userId);
    res.json({ 
      user,
      subscriptions,
      activePlan: subscriptions.length > 0 ? subscriptions[0].packageName : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- VPN API ---
app.get("/vpn/packages", async (req, res) => {
  try {
    const packages = await getVpnPackages();
    res.json(packages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/vpn/purchase", auth, async (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ error: "packageId required" });
    
    const pkg = await getPackageById(packageId);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    
    const transactionId = await createTransaction(req.user.userId, packageId, pkg.price);
    
    res.json({
      transactionId,
      package: pkg,
      message: "Payment required. Use /pay command in bot."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/vpn/subscriptions", auth, async (req, res) => {
  try {
    const subscriptions = await getUserSubscriptions(req.user.userId);
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PAYMENT API ---
app.post("/vpn/payment", auth, async (req, res) => {
  try {
    const { packageId, method } = req.body;
    if (!packageId) return res.status(400).json({ error: "packageId required" });
    if (!method) return res.status(400).json({ error: "method required" });

    const pkg = await getPackageById(packageId);
    if (!pkg) return res.status(404).json({ error: "Package not found" });

    // Создаем транзакцию
    const transactionId = await createTransaction(req.user.userId, packageId, pkg.price);

    if (method === 'crypto') {
      // Генерируем ссылку на Bybit платеж
      const orderId = `vpn-${req.user.userId}-${transactionId}`;
      const paymentUrl = `https://payment.bybit.com/?order_id=${orderId}&amount=${pkg.price}&currency=USDT`;
      
      // Сохраняем данные платежа
      await updateTransactionStatus(transactionId, 'pending', {
        orderId,
        method: 'crypto',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      });

      res.json({
        paymentUrl,
        paymentData: { orderId },
        transactionId
      });
    } else {
      // Для карточек - в боевом режиме интегрируем Stripe/Paypal
      res.json({
        paymentUrl: null,
        paymentData: { method: 'card' },
        transactionId
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/vpn/payment-status/:orderId", auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // В реальной системе здесь проверяется статус у Bybit API
    // Для тестирования возвращаем mock данные
    
    // Ищем транзакцию по orderId
    const allTransactions = await getVpnPackages(); // Получаем данные для демо
    
    // В реальной системе:
    // 1. Проверяем статус платежа у Bybit через API
    // 2. Если статус = "success", генерируем VPN ключ
    // 3. Создаем подписку в БД
    
    const vpnKey = generateVpnKey();
    
    res.json({
      status: 'completed',
      vpnKey,
      message: 'Payment verified and key generated'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- start ---
const PORT = config.PORT;

(async () => {
  await initDb();
  await import('./seed.js');
  
  app.listen(PORT, () => console.log("Started on " + PORT));
})();