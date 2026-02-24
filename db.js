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
  return await get('SELECT * FROM transactions WHERE id = ?', [transactionId]);
}

export async function getTransactionByOrderId(orderId) {
  return await get('SELECT * FROM transactions WHERE paymentData LIKE ?', [`%"orderId":"${orderId}"%`]);
}

export async function createPackage(name, description, durationDays, price, servers = 1) {
  const result = await run(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [name, description || '', durationDays, price, servers]);
  
  return result.lastID;
}

export { run, get, all };
