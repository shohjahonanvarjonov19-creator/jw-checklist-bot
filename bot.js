require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { CHECKLISTS } = require("./checklists");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MANAGERS_CHAT_ID = process.env.MANAGERS_CHAT_ID;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не задан. Добавьте его в .env");
  process.exit(1);
}
if (!MANAGERS_CHAT_ID) {
  console.warn("⚠️  MANAGERS_CHAT_ID не задан — уведомления менеджерам отправляться не будут.");
}

const bot = new Telegraf(BOT_TOKEN);

// В памяти храним прогресс каждого пользователя по chat.id.
// Для небольшого отеля этого достаточно; при перезапуске бота
// прогресс сбрасывается (это ок — чек-лист короткий).
const sessions = new Map();

function roleMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🧳 Белбой", "role:bellboy")],
    [Markup.button.callback("🛎 Консьерж", "role:concierge")]
  ]);
}

function itemKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Готово", "step:done")]
  ]);
}

function startSession(chatId, role) {
  sessions.set(chatId, {
    role,
    index: 0,
    startedAt: new Date()
  });
}

async function sendCurrentItem(ctx) {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  const list = CHECKLISTS[session.role];
  const total = list.items.length;

  if (session.index >= total) {
    return finishChecklist(ctx);
  }

  const itemText = list.items[session.index];
  await ctx.reply(
    `${list.title}\nПункт ${session.index + 1} из ${total}:\n\n${itemText}`,
    itemKeyboard()
  );
}

async function finishChecklist(ctx) {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  const list = CHECKLISTS[session.role];
  const user = ctx.from;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const username = user.username ? `@${user.username}` : "";
  const finishedAt = new Date();

  await ctx.reply(
    `✅ ${list.title} завершён! Спасибо, отличная смена 👍`,
    Markup.removeKeyboard()
  );

  if (MANAGERS_CHAT_ID) {
    const report =
      `📋 Чек-лист завершён\n\n` +
      `Роль: ${list.title}\n` +
      `Сотрудник: ${name} ${username}\n` +
      `Время: ${finishedAt.toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}\n` +
      `Пунктов выполнено: ${list.items.length}/${list.items.length}`;

    try {
      await bot.telegram.sendMessage(MANAGERS_CHAT_ID, report);
    } catch (err) {
      console.error("Не удалось отправить уведомление менеджерам:", err.message);
    }
  }

  sessions.delete(chatId);
}

bot.start(async (ctx) => {
  sessions.delete(ctx.chat.id);
  await ctx.reply(
    "Добро пожаловать! Выберите чек-лист для начала смены:",
    roleMenu()
  );
});

bot.action(/role:(bellboy|concierge)/, async (ctx) => {
  const role = ctx.match[1];
  startSession(ctx.chat.id, role);
  await ctx.answerCbQuery();
  await sendCurrentItem(ctx);
});

bot.action("step:done", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  await ctx.answerCbQuery("Отмечено ✅");

  if (!session) {
    await ctx.reply("Сессия не найдена. Нажмите /start, чтобы начать заново.");
    return;
  }

  session.index += 1;
  await sendCurrentItem(ctx);
});

// Команда для менеджеров: узнать chat_id группы, чтобы вписать
// его в .env как MANAGERS_CHAT_ID (добавьте бота в группу и
// один раз вызовите /chatid там).
bot.command("chatid", async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

bot.launch();
console.log("🤖 Бот запущен");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
