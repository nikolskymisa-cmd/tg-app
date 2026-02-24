import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);

// ВАЖНО: сюда ссылка на твой сайт
// Пока тестишь локально — обычный localhost НЕ откроется внутри Telegram.
// Поэтому нужно сначала выложить на хостинг (Render), или использовать туннель (ngrok).
const WEBAPP_URL = "https://tg-app-2n4r.onrender.com";

bot.start((ctx) => {
  ctx.reply(
    "Открыть кабинет:",
    Markup.inlineKeyboard([
      Markup.button.webApp("📲 Открыть", WEBAPP_URL)
    ])
  );
});

bot.launch();
console.log("Bot started");