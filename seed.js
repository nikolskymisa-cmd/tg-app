import db from './db.js';

// Создаем пакеты если их еще нет
const packages = db.prepare('SELECT COUNT(*) as count FROM vpn_packages').get();

if (packages.count === 0) {
  db.prepare(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers)
    VALUES (?, ?, ?, ?, ?)
  `).run('Стартер', 'Для тестирования', 7, 2.99, 3);

  db.prepare(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers)
    VALUES (?, ?, ?, ?, ?)
  `).run('Базовый', 'Для личного использования', 30, 8.99, 5);

  db.prepare(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers)
    VALUES (?, ?, ?, ?, ?)
  `).run('Премиум', 'Все серверы + поддержка', 30, 14.99, 10);

  db.prepare(`
    INSERT INTO vpn_packages (name, description, durationDays, price, servers)
    VALUES (?, ?, ?, ?, ?)
  `).run('Мега', 'Максимум возможностей', 90, 34.99, 15);

  console.log('✅ VPN пакеты созданы');
} else {
  console.log('✅ Пакеты уже существуют');
}
