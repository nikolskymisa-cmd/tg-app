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
  createSubscription,
  createPackage,
  initDb,
  getOrCreateWallet,
  getWallet,
  addBalance,
  spendBalance,
  getWalletHistory,
  addGameScore,
  getTopScores
} from "./db.js";
import { generateVpnKey, generateVpnConfig } from "./payment.js";
import BybitPayment from "./payment.js";

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
    if (!method) return res.status(400).json({ error: "method required (crypto or card)" });

    const pkg = await getPackageById(packageId);
    if (!pkg) return res.status(404).json({ error: "Package not found" });

    // Создаем транзакцию
    const transactionId = await createTransaction(req.user.userId, packageId, pkg.price);
    const orderId = `vpn-${req.user.userId}-${transactionId}-${Date.now()}`;

    if (method === 'crypto') {
      try {
        // Используем реальную Bybit интеграцию
        const bybit = new BybitPayment();
        const callbackUrl = `${config.WEBAPP_URL}/payment/webhook`;
        
        const orderResult = await bybit.createOrder(
          orderId,
          pkg.price,
          'USDT',
          callbackUrl
        );

        // Сохраняем данные платежа в транзакцию
        await updateTransactionStatus(transactionId, 'pending', {
          orderId,
          method: 'crypto',
          bybitOrderId: orderResult.orderId,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        });

        res.json({
          success: true,
          paymentUrl: orderResult.paymentUrl,
          orderId: orderResult.orderId,
          transactionId,
          expiryTime: orderResult.expiryTime
        });
      } catch (bybitErr) {
        console.error('Bybit error:', bybitErr);
        // Fallback на демо режим если нет API ключей
        const paymentUrl = `https://payment-demo.bybit.com/?order_id=${orderId}&amount=${pkg.price}&currency=USDT`;
        
        await updateTransactionStatus(transactionId, 'pending', {
          orderId,
          method: 'crypto',
          demo: true
        });

        res.json({
          success: true,
          paymentUrl,
          orderId,
          transactionId,
          demo: true
        });
      }
    } else if (method === 'card') {
      // Для карточек - в боевом режиме интегрируем Stripe/PayPal
      res.json({
        success: true,
        method: 'card',
        transactionId,
        orderId,
        message: 'Card payment processing in development'
      });
    } else {
      res.status(400).json({ error: "Invalid payment method" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/vpn/payment-status/:orderId", auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Получаем информацию о транзакции
    const transaction = await getTransactionByOrderId(orderId);
    
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Если уже оплачено - возвращаем успех
    if (transaction.status === 'completed') {
      return res.json({
        status: 'completed',
        orderId,
        paid: true
      });
    }

    // Проверяем статус у Bybit если это крипто платеж
    if (transaction.paymentMethod === 'crypto' && transaction.paymentData?.bybitOrderId) {
      try {
        const bybit = new BybitPayment();
        const statusResult = await bybit.checkPaymentStatus(transaction.paymentData.bybitOrderId);
        
        if (statusResult.status === 'PAID' || statusResult.status === 'SUCCESS') {
          // Обновляем статус в БД
          await updateTransactionStatus(transaction.id, 'completed', {
            ...transaction.paymentData,
            paidAt: new Date().toISOString()
          });

          return res.json({
            status: 'completed',
            orderId,
            paid: true,
            bybitStatus: statusResult.status
          });
        }

        return res.json({
          status: transaction.status,
          orderId,
          paid: false,
          bybitStatus: statusResult.status
        });
      } catch (bybitErr) {
        console.error('Bybit check error:', bybitErr);
        // Fallback - в демо режиме считаем оплаченным через минуту
        const createdTime = new Date(transaction.createdAt).getTime();
        const now = Date.now();
        if (now - createdTime > 60000) {
          await updateTransactionStatus(transaction.id, 'completed', {
            ...transaction.paymentData,
            paidAt: new Date().toISOString()
          });
          return res.json({
            status: 'completed',
            orderId,
            paid: true
          });
        }

        return res.json({
          status: 'pending',
          orderId,
          paid: false
        });
      }
    }

    // Для карточек - пока в разработке
    res.json({
      status: transaction.status,
      orderId,
      paid: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook для Bybit платежей
app.post("/payment/webhook", async (req, res) => {
  try {
    const signature = req.headers['x-bapi-sign'];
    const payload = req.body;

    if (!signature) {
      return res.status(400).json({ error: "Missing signature" });
    }

    // Проверяем подпись webhook'а
    const bybit = new BybitPayment();
    if (!bybit.verifyWebhookSignature(payload, signature)) {
      console.warn('Invalid webhook signature');
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Получаем информацию о заказе
    const orderId = payload.order_id;
    const transaction = await getTransactionByOrderId(orderId);

    if (!transaction) {
      console.warn(`Transaction not found for order ${orderId}`);
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Обновляем статус
    if (payload.order_status === 'PAID' || payload.order_status === 'SUCCESS') {
      await updateTransactionStatus(transaction.id, 'completed', {
        ...transaction.paymentData,
        bybitStatus: payload.order_status,
        paidAt: new Date().toISOString()
      });
      
      console.log(`Payment completed for transaction ${transaction.id}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Завершить платеж и создать подписку
app.post("/vpn/complete-payment", auth, async (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ error: "packageId required" });

    const pkg = await getPackageById(packageId);
    if (!pkg) return res.status(404).json({ error: "Package not found" });

    // Генерируем VPN ключ
    const vpnKey = generateVpnKey();

    // Создаем подписку
    const subscriptionId = await createSubscription(req.user.userId, packageId, vpnKey);

    res.json({
      subscriptionId,
      vpnKey,
      message: 'Subscription created successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WALLET API ---
app.get("/wallet/balance", auth, async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.userId);
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/wallet/topup", auth, async (req, res) => {
  try {
    const { amount, method, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    // В реальной системе здесь проверялась бы оплата (Stripe, etc)
    // Для сейчас просто добавляем баланс
    const wallet = await addBalance(req.user.userId, amount, description || `Topup via ${method || 'card'}`);

    res.json({
      success: true,
      wallet,
      message: `Added ${amount} to your account`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/wallet/history", auth, async (req, res) => {
  try {
    const history = await getWalletHistory(req.user.userId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/wallet/spend", auth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    const wallet = await spendBalance(req.user.userId, amount, description || "VPN purchase");

    res.json({
      success: true,
      wallet,
      message: `Spent ${amount} coins`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GAME API ---
app.post("/game/score", auth, async (req, res) => {
  try {
    const { score, game } = req.body;
    
    if (score === undefined || score < 0) {
      return res.status(400).json({ error: "Valid score required" });
    }

    // Вычисляем награду: 1 очко = 0.1 монеты, минимум 1
    const coinsEarned = Math.max(1, Math.floor(score / 10));

    const gameId = await addGameScore(req.user.userId, score, coinsEarned);
    const wallet = await getWallet(req.user.userId);
    const topScores = await getTopScores(5);

    res.json({
      success: true,
      gameId,
      score,
      coinsEarned,
      newBalance: wallet.balance,
      topScores
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/game/leaderboard", async (req, res) => {
  try {
    const scores = await getTopScores(20);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить VPN пакет (для админа)
app.post("/vpn/package", async (req, res) => {
  try {
    const { name, description, durationDays, price, servers } = req.body;
    
    if (!name || !durationDays || !price) {
      return res.status(400).json({ error: "name, durationDays, price required" });
    }

    const id = await createPackage(name, description, durationDays, price, servers || 1);

    res.json({
      id,
      name,
      description,
      durationDays,
      price,
      servers: servers || 1
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