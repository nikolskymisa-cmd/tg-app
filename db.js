import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'vpn.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// --- Таблицы ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId INTEGER UNIQUE NOT NULL,
    firstName TEXT,
    username TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vpn_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    durationDays INTEGER NOT NULL,
    price REAL NOT NULL,
    servers INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    packageId INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(packageId) REFERENCES vpn_packages(id)
  );
`);

// --- Функции ---
export function getOrCreateUser(telegramId, firstName, username) {
  let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  if (!user) {
    db.prepare('INSERT INTO users (telegramId, firstName, username) VALUES (?, ?, ?)')
      .run(telegramId, firstName, username);
    user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  }
  return user;
}

export function getVpnPackages() {
  return db.prepare('SELECT * FROM vpn_packages WHERE active = 1 ORDER BY price ASC').all();
}

export function getPackageById(packageId) {
  return db.prepare('SELECT * FROM vpn_packages WHERE id = ?').get(packageId);
}

export function createSubscription(userId, packageId, vpnKey) {
  const pkg = getPackageById(packageId);
  if (!pkg) throw new Error('Package not found');
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + pkg.durationDays);
  
  const result = db.prepare(`
    INSERT INTO subscriptions (userId, packageId, vpnKey, endDate)
    VALUES (?, ?, ?, ?)
  `).run(userId, packageId, vpnKey, endDate.toISOString());
  
  return result.lastInsertRowid;
}

export function getUserSubscriptions(userId) {
  return db.prepare(`
    SELECT s.*, p.name as packageName, p.durationDays
    FROM subscriptions s
    JOIN vpn_packages p ON s.packageId = p.id
    WHERE s.userId = ? AND s.status = 'active'
    ORDER BY s.endDate DESC
  `).all(userId);
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function createTransaction(userId, packageId, amount) {
  const result = db.prepare(`
    INSERT INTO transactions (userId, packageId, amount, status)
    VALUES (?, ?, ?, 'pending')
  `).run(userId, packageId, amount);
  return result.lastInsertRowid;
}

export default db;
