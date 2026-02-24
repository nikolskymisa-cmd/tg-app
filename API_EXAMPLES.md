# Примеры API запросов для тестирования TG VPN App

## 1. Аутентификация

### Получить токен
```bash
curl -X POST http://localhost:3000/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "initData": "query_id=test&user=%7B%22id%22:123456,%22first_name%22:%22Test%22%7D"
  }'
```

Ответ:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "telegramId": 123456,
    "firstName": "Test"
  }
}
```

## 2. Получить профиль пользователя

```bash
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 3. Получить список пакетов

```bash
curl -X GET http://localhost:3000/vpn/packages
```

Ответ:
```json
[
  {
    "id": 1,
    "name": "Стартер",
    "description": "Для начинающих",
    "price": 2.99,
    "durationDays": 7,
    "servers": 3
  },
  {
    "id": 2,
    "name": "Базовый",
    "price": 8.99,
    "durationDays": 30,
    "servers": 5
  }
]
```

## 4. Создать платеж (Bybit)

```bash
curl -X POST http://localhost:3000/vpn/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "packageId": 1,
    "method": "crypto"
  }'
```

Ответ:
```json
{
  "success": true,
  "paymentUrl": "https://payment.bybit.com/?order_id=vpn-user-1-123...",
  "orderId": "vpn-user-1-123",
  "transactionId": 1,
  "expiryTime": 1800
}
```

## 5. Проверить статус платежа

```bash
curl -X GET http://localhost:3000/vpn/payment-status/vpn-user-1-123 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Ответ (ожидание):
```json
{
  "status": "pending",
  "orderId": "vpn-user-1-123",
  "paid": false
}
```

Ответ (успех):
```json
{
  "status": "completed",
  "orderId": "vpn-user-1-123",
  "paid": true,
  "bybitStatus": "PAID"
}
```

## 6. Завершить платеж и получить VPN ключ

```bash
curl -X POST http://localhost:3000/vpn/complete-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "packageId": 1
  }'
```

Ответ:
```json
{
  "subscriptionId": 1,
  "vpnKey": "vpn-aBcDeFgHiJkLmNoPqRsTuVwXyZ12345",
  "message": "Subscription created successfully"
}
```

## 7. Получить активные подписки

```bash
curl -X GET http://localhost:3000/vpn/subscriptions \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Ответ:
```json
[
  {
    "id": 1,
    "packageName": "Базовый",
    "vpnKey": "vpn-aBcDeFgHiJkLmNoPqRsTuVwXyZ12345",
    "startDate": "2026-02-25T10:00:00.000Z",
    "endDate": "2026-03-27T10:00:00.000Z",
    "status": "active"
  }
]
```

## 8. Добавить новый VPN пакет (админ)

```bash
curl -X POST http://localhost:3000/vpn/package \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Максимум",
    "description": "Для профессионалов",
    "durationDays": 365,
    "price": 99.99,
    "servers": 50
  }'
```

## 🔐 Тестирование Bybit Webhook

### Mock webhook от Bybit

```bash
curl -X POST http://localhost:3000/payment/webhook \
  -H "Content-Type: application/json" \
  -H "X-BAPI-SIGN: test_signature" \
  -d '{
    "order_id": "vpn-user-1-123",
    "order_status": "PAID",
    "amount": 8.99,
    "coin": "USDT"
  }'
```

## 💡 Полезные команды

### Включить debug логирование
```bash
DEBUG=* npm start
```

### Запустить с ngrok для webhooks
```bash
npm install -g ngrok
ngrok http 3000
# Скопировать URL и обновить WEBHOOK_URL в Bybit
```

### Очистить базу данных
```bash
rm vpn.db
npm start
# БД пересоздастся автоматически
```

## 🧪 Тестирование в Demo режиме

Если Bybit API ключи не настроены, приложение автоматически использует demo режим.

В demo режиме:
- ✅ Пакеты загружаются нормально
- ✅ Платежи создаются с генерацией orderId
- ✅ Статус платежа проверяется каждые 10 секунд
- ✅ После ~1 минуты платеж считается успешным
- ✅ VPN ключи генерируются и сохраняются

Чтобы переключиться на реальный режим:
1. Получить Bybit API ключи
2. Заполнить .env файл
3. Перезагрузить сервер

## 📞 Troubleshooting

### Ошибка: "Bybit API ключи не настроены"
- Проверь .env файл
- Убедись что BYBIT_API_KEY и BYBIT_API_SECRET заполнены
- Перезагрузи сервер

### Ошибка при webhook верификации
- Проверь BYBIT_WEBHOOK_SECRET в .env
- Убедись что webhook URL правильно добавлен в Bybit
- Логи смотри в консоли сервера

### Платежи не проходят в sandbox
- Используй тестовые ордера из документации Bybit
- Проверь что BYBIT_USE_SANDBOX=true
- Убедись что используешь sandbox API ключи

### VPN ключ не активируется
- Проверь что платеж помечен как PAID в Bybit
- Убедись что /vpn/complete-payment вызывается после подтверждения
- Проверь логи в консоли сервера
