export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || "8799078480:AAEPLh4n4oKY3Q-zKhWiM2TQXJazyqJ1l4w",
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",
  WEBAPP_URL: process.env.WEBAPP_URL || "https://tg-app-2n4r.onrender.com",
  PORT: process.env.PORT || 3000,
  
  // Bybit Configuration
  BYBIT_API_KEY: process.env.BYBIT_API_KEY || "",
  BYBIT_API_SECRET: process.env.BYBIT_API_SECRET || "",
  BYBIT_USE_SANDBOX: process.env.BYBIT_USE_SANDBOX !== "false",
  BYBIT_WEBHOOK_SECRET: process.env.BYBIT_WEBHOOK_SECRET || ""
};
