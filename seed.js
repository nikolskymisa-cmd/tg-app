import { getVpnPackages, createPackage } from './db.js';

// Функция для запуска миграции пакетов
export async function seedPackages() {
  try {
    const packages = await getVpnPackages();
    
    if (packages.length === 0) {
      console.log('Creating default VPN packages...');
      
      await createPackage('Стартер', 'Для тестирования', 7, 2.99, 3);
      await createPackage('Базовый', 'Для личного использования', 30, 8.99, 5);
      await createPackage('Премиум', 'Все серверы + поддержка', 30, 14.99, 10);
      await createPackage('Мега', 'Максимум возможностей', 90, 34.99, 15);
      
      console.log('✅ Default VPN packages created');
    } else {
      console.log(`✅ ${packages.length} VPN packages already exist`);
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

// Запускаем миграцию
seedPackages();
