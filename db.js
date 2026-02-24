import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'vpn.db');

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath);

// Функция для выполнения запросов (синхронный интерфейс)
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// --- Инициализация таблиц ---
export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegramId INTEGER UNIQUE NOT NULL,
      firstName TEXT,
      username TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS vpn_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      durationDays INTEGER NOT NULL,
      price REAL NOT NULL,
      servers INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      packageId INTEGER NOT NULL,
      vpnKey TEXT UNIQUE NOT NULL,
      vpnConfig TEXT,
      startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      endDate DATETIME NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(packageId) REFERENCES vpn_packages(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      packageId INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      paymentMethod TEXT DEFAULT 'crypto',
      paymentData TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(packageId) REFERENCES vpn_packages(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER UNIQUE NOT NULL,
      balance REAL DEFAULT 0,
      totalEarned REAL DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      game TEXT DEFAULT 'flappy_bird',
      score INTEGER NOT NULL,
      coinsEarned INTEGER NOT NULL,
      playedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);
}

// --- Функции ---
export async function getOrCreateUser(telegramId, firstName, username) {
  let user = await get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);
  if (!user) {
    await run('INSERT INTO users (telegramId, firstName, username) VALUES (?, ?, ?)',
      [telegramId, firstName, username]);
    user = await get('SELECT * FROM users WHERE telegramId = ?', [telegramId]);
  }
  return user;
}

export async function getVpnPackages() {
  return await all('SELECT * FROM vpn_packages WHERE active = 1 ORDER BY price ASC');
}

export async function getPackageById(packageId) {
  return await get('SELECT * FROM vpn_packages WHERE id = ?', [packageId]);
}

export async function createSubscription(userId, packageId, vpnKey) {
  const pkg = await getPackageById(packageId);
  if (!pkg) throw new Error('Package not found');
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + pkg.durationDays);
  
  const result = await run(`
    INSERT INTO subscriptions (userId, packageId, vpnKey, endDate)
    VALUES (?, ?, ?, ?)
  `, [userId, packageId, vpnKey, endDate.toISOString()]);
  
  return result.lastID;
}

export async function getUserSubscriptions(userId) {
  return await all(`
    SELECT s.*, p.name as packageName, p.durationDays
    FROM subscriptions s
    JOIN vpn_packages p ON s.packageId = p.id
    WHERE s.userId = ? AND s.status = 'active'
    ORDER BY s.endDate DESC
  `, [userId]);
}

export async function getUserById(userId) {
  return await get('SELECT * FROM users WHERE id = ?', [userId]);
}

export async function createTransaction(userId, packageId, amount) {
  const result = await run(`
    INSERT INTO transactions (userId, packageId, amount, status)
    VALUES (?, ?, ?, 'pending')
  `, [userId, packageId, amount]);
  return result.lastID;
}

export async function updateTransactionStatus(transactionId, status, paymentData = {}) {
  await run(`
    UPDATE transactions 
    SET status = ?, paymentData = ?
    WHERE id = ?
  `, [status, JSON.stringify(paymentData), transactionId]);
}

export async function getTransaction(transactionId) {
  const trans = await get('SELECT * FROM transactions WHERE id = ?', [transactionId]);
  if (trans && trans.paymentData) {
    trans.paymentData = JSON.parse(trans.paymentData);
  }
  return trans;
}

export async function getTransactionByOrderId(orderId) {
  // Получаем все транзакции и ищем по orderId в paymentData
  const transactions = await all('SELECT * FROM transactions');
  for (const trans of transactions) {
    try {
      const data = JSON.parse(trans.paymentData || '{}');
      if (data.orderId === orderId) {
        trans.paymentData = data;
        return trans;
      }
    } catch (e) {
      // Skip malformed JSON
    }
  }
  return null;
}

export async function createPackage(name, description, durationDays, price, servers = 1) {
  const result = await run(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [name, description || '', durationDays, price, servers]);
  
  return result.lastID;
}

// --- Функции кошелька ---
export async function getOrCreateWallet(userId) {
  let wallet = await get('SELECT * FROM wallets WHERE userId = ?', [userId]);
  if (!wallet) {
    await run('INSERT INTO wallets (userId, balance) VALUES (?, 0)', [userId]);
    wallet = await get('SELECT * FROM wallets WHERE userId = ?', [userId]);
  }
  return wallet;
}

export async function getWallet(userId) {
  return await get('SELECT * FROM wallets WHERE userId = ?', [userId]);
}

export async function addBalance(userId, amount, description) {
  // Получаем или создаем кошелек
  await getOrCreateWallet(userId);
  
  // Добавляем транзакцию
  await run(`
    INSERT INTO wallet_transactions (userId, type, amount, description)
    VALUES (?, 'topup', ?, ?)
  `, [userId, amount, description || 'Account topup']);
  
  // Обновляем баланс
  await run(`
    UPDATE wallets 
    SET balance = balance + ?, totalEarned = totalEarned + ?, updatedAt = CURRENT_TIMESTAMP
    WHERE userId = ?
  `, [amount, amount, userId]);
  
  return await getWallet(userId);
}

export async function spendBalance(userId, amount, description) {
  const wallet = await getWallet(userId);
  if (!wallet) throw new Error('Wallet not found');
  if (wallet.balance < amount) throw new Error('Insufficient balance');
  
  // Добавляем транзакцию
  await run(`
    INSERT INTO wallet_transactions (userId, type, amount, description)
    VALUES (?, 'spend', ?, ?)
  `, [userId, amount, description || 'VPN purchase']);
  
  // Обновляем баланс
  await run(`
    UPDATE wallets 
    SET balance = balance - ?, totalSpent = totalSpent + ?, updatedAt = CURRENT_TIMESTAMP
    WHERE userId = ?
  `, [amount, amount, userId]);
  
  return await getWallet(userId);
}

export async function getWalletHistory(userId, limit = 50) {
  return await all(`
    SELECT * FROM wallet_transactions 
    WHERE userId = ? 
    ORDER BY createdAt DESC 
    LIMIT ?
  `, [userId, limit]);
}

export async function addGameScore(userId, score, coinsEarned = 0) {
  const result = await run(`
    INSERT INTO game_scores (userId, score, coinsEarned)
    VALUES (?, ?, ?)
  `, [userId, score, coinsEarned]);
  
  // Добавляем монеты в кошелек
  if (coinsEarned > 0) {
    await addBalance(userId, coinsEarned, `Game reward: ${score} points`);
  }
  
  return result.lastID;
}

export async function getTopScores(limit = 10) {
  return await all(`
    SELECT u.firstName, gs.score, gs.coinsEarned, gs.playedAt
    FROM game_scores gs
    JOIN users u ON gs.userId = u.id
    ORDER BY gs.score DESC
    LIMIT ?
  `, [limit]);
}

export { run, get, all };
