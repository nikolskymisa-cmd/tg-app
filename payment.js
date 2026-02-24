import crypto from 'crypto';
import { config } from './config.js';

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

// Bybit Payment Integration
export class BybitPayment {
  constructor() {
    this.apiKey = config.BYBIT_API_KEY;
    this.apiSecret = config.BYBIT_API_SECRET;
    this.baseURL = config.BYBIT_USE_SANDBOX 
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';
    this.webhookSecret = config.BYBIT_WEBHOOK_SECRET;
  }

  // Генерировать подпись для Bybit API
  generateSignature(params, timestamp) {
    const queryString = Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    const payload = `${timestamp}${this.apiKey}${queryString}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
  }

  // Создать заказ оплаты на Bybit
  async createOrder(orderId, amount, currency = 'USDT', callbackUrl) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Bybit API ключи не настроены');
    }

    const timestamp = Date.now();
    const params = {
      accountType: 'UNIFIED',
      coin: currency,
      amount: amount.toString(),
      merchant: 'tgapp_vpn',
      order_id: orderId,
      call_back: callbackUrl
    };

    const sign = this.generateSignature(params, timestamp);

    try {
      const response = await fetch(`${this.baseURL}/v5/payment/order-create`, {
        method: 'POST',
        headers: {
          'X-BAPI-SIGN': sign,
          'X-BAPI-API-KEY': this.apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-RECV-WINDOW': '5000',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      const data = await response.json();
      
      if (data.retCode === 0) {
        return {
          success: true,
          orderId: data.result?.order_id,
          paymentUrl: data.result?.payment_url,
          expiryTime: data.result?.expire_time
        };
      } else {
        throw new Error(data.retMsg || 'Ошибка создания заказа Bybit');
      }
    } catch (err) {
      console.error('Bybit order creation error:', err);
      throw err;
    }
  }

  // Проверить статус платежа
  async checkPaymentStatus(orderId) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Bybit API ключи не настроены');
    }

    const timestamp = Date.now();
    const params = {
      order_id: orderId
    };

    const sign = this.generateSignature(params, timestamp);

    try {
      const response = await fetch(`${this.baseURL}/v5/payment/query-order?order_id=${orderId}`, {
        method: 'GET',
        headers: {
          'X-BAPI-SIGN': sign,
          'X-BAPI-API-KEY': this.apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-RECV-WINDOW': '5000'
        }
      });

      const data = await response.json();
      
      if (data.retCode === 0) {
        return {
          orderId: data.result?.order_id,
          status: data.result?.order_status, // INITIAL, PENDING, PAID, CANCELLED, EXPIRED
          amount: data.result?.amount,
          coin: data.result?.coin,
          timestamp: data.result?.create_time
        };
      } else {
        throw new Error(data.retMsg || 'Ошибка проверки статуса');
      }
    } catch (err) {
      console.error('Bybit status check error:', err);
      throw err;
    }
  }

  //验证 webhook подпись
  verifyWebhookSignature(payload, signature) {
    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return hash === signature;
  }
}

export default new BybitPayment();
