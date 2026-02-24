import { getVpnPackages, createTransaction } from './db.js';

// Функция для запуска миграции пакетов
export async function seedPackages() {
  try {
    const packages = await getVpnPackages();
    
    if (packages.length === 0) {
      console.log('Creating VPN packages...');
      // Пакеты будут созданы при необходимости
      // На данный момент используем getVpnPackages для проверки
    } else {
      console.log('✅ VPN packages already exist');
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

// Запускаем миграцию
seedPackages();
