# Новые API endpoints - Кошелек и Игра

## 💰 Кошелек API

### 1. Получить баланс пользователя

```bash
GET /wallet/balance
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "id": 1,
  "userId": 1,
  "balance": 100.50,
  "totalEarned": 250.00,
  "totalSpent": 149.50,
  "updatedAt": "2026-02-25T10:30:00.000Z"
}
```

### 2. Пополнить баланс

```bash
POST /wallet/topup
Content-Type: application/json
Authorization: Bearer <token>

{
  "amount": 50,
  "method": "card",
  "description": "Topup via card"
}
```

**Ответ:**
```json
{
  "success": true,
  "wallet": {
    "balance": 150.50,
    "totalEarned": 300.00,
    "totalSpent": 149.50
  },
  "message": "Added 50 to your account"
}
```

### 3. Получить историю операций

```bash
GET /wallet/history
Authorization: Bearer <token>
```

**Ответ:**
```json
[
  {
    "id": 5,
    "userId": 1,
    "type": "topup",
    "amount": 50,
    "description": "Topup via card",
    "createdAt": "2026-02-25T10:30:00.000Z"
  },
  {
    "id": 4,
    "userId": 1,
    "type": "spend",
    "amount": 8.99,
    "description": "VPN purchase",
    "createdAt": "2026-02-25T09:00:00.000Z"
  }
]
```

### 4. Потратить монеты

```bash
POST /wallet/spend
Content-Type: application/json
Authorization: Bearer <token>

{
  "amount": 10,
  "description": "VPN purchase"
}
```

## 🎮 Игра API

### 1. Сохранить результат Flappy Bird

```bash
POST /game/score
Content-Type: application/json
Authorization: Bearer <token>

{
  "score": 125,
  "game": "flappy_bird"
}
```

**Ответ:**
```json
{
  "success": true,
  "gameId": 1,
  "score": 125,
  "coinsEarned": 12,
  "newBalance": 112.50,
  "topScores": [
    {
      "firstName": "Nikolai",
      "score": 250,
      "coinsEarned": 25,
      "playedAt": "2026-02-25T10:00:00.000Z"
    }
  ]
}
```

### 2. Получить таблицу лидеров

```bash
GET /game/leaderboard
```

**Ответ:**
```json
[
  {
    "firstName": "Nikolai",
    "score": 250,
    "coinsEarned": 25,
    "playedAt": "2026-02-25T10:00:00.000Z"
  },
  {
    "firstName": "Alice",
    "score": 180,
    "coinsEarned": 18,
    "playedAt": "2026-02-25T09:30:00.000Z"
  }
]
```

## 📊 Система расчета наград

### Награды за игру Flappy Bird

```
coinsEarned = floor(score / 10)
Минимум: 1 монета

Таблица примеров:
┌────────┬──────────┐
│ Очки   │ Монеты   │
├────────┼──────────┤
│ 10     │ 1        │
│ 50     │ 5        │
│ 100    │ 10       │
│ 250    │ 25       │
│ 500    │ 50       │
│ 1000   │ 100      │
└────────┴──────────┘
```

## 💾 Типы операций в истории

| Тип | Описание | Действие |
|-----|---------|----------|
| topup | Пополнение баланса | Добавляет монеты |
| spend | Трата монет | Вычитает монеты |
| game_reward | Награда за игру | Добавляет монеты |

## ⚠️ Обработка ошибок

### Ошибка: Недостаточно средств

```json
{
  "error": "Insufficient balance"
}
```

### Ошибка: Некорректная сумма

```json
{
  "error": "Valid amount required"
}
```

### Ошибка: Некорректный результат игры

```json
{
  "error": "Valid score required"
}
```

## 🔄 Примеры использования

### Сценарий 1: Пополнение и покупка VPN

```
1. GET /wallet/balance → balance: 50
2. POST /wallet/topup (amount: 20) → balance: 70
3. POST /wallet/spend (amount: 8.99 для VPN) → balance: 61.01
4. POST /vpn/complete-payment
```

### Сценарий 2: Игра и заработок

```
1. POST /game/score (score: 150) → coinsEarned: 15, balance: +15
2. GET /wallet/balance → balance: 65.01
3. POST /game/score (score: 200) → coinsEarned: 20, balance: +20
4. GET /game/leaderboard → увидеть свой рейтинг
```

### Сценарий 3: Полный цикл

```
1. Пользователь пополняет баланс на 100 монет
2. Играет в Flappy Bird (100 очков = 10 монет)
3. Новый баланс: 110 монет
4. Покупает VPN на 8.99 монет
5. Новый баланс: 101.01 монет
```

## 🎯 Лучшие практики

1. **Проверяйте баланс перед покупкой**
   ```bash
   GET /wallet/balance
   ```

2. **Всегда сохраняйте результаты игры**
   ```bash
   POST /game/score
   ```

3. **Мониторьте историю операций**
   ```bash
   GET /wallet/history
   ```

4. **Проверяйте таблицу лидеров**
   ```bash
   GET /game/leaderboard
   ```

---

Более подробную информацию см. в WALLET_GAME_GUIDE.md
