import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);
// Используйте HTTPS URL для мини-приложения
const WEBAPP_URL = process.env.WEBAPP_URL || "https://tg-app-2n4r.onrender.com";

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

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));