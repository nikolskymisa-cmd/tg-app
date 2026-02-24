// Bybit Integration Config
export const bybitConfig = {
  API_URL: 'https://api.bybit.com',
  // Используйте ваши реальные ключи для production
  // Для тестирования используйте sandbox
  USE_SANDBOX: true,
};

// Для sandbox использование:
// API_URL: 'https://api-testnet.bybit.com'

// Генерировать случайный VPN ключ
export function generateVpnKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `vpn-${result}`;
}

// Формат конфига для VPN
export function generateVpnConfig(vpnKey) {
  return {
    key: vpnKey,
    protocol: 'wireguard',
    server: 'vpn.example.com',
    dns: ['8.8.8.8', '8.8.4.4']
  };
}
