import "dotenv/config";
import { runCheckOnce } from "./notifier.js";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.log(`⚠️ Variável ausente: ${name}`);
    return false;
  }
  return true;
}

function getIntervalMs() {
  const minutes = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return safeMinutes * 60 * 1000;
}

async function main() {
  console.log("🚀 Iniciando Amazon Price Monitor (scraping como fonte de preço)");
  console.log("⏱️ Intervalo (min):", process.env.CHECK_INTERVAL_MINUTES || 30);
  console.log("🏷️ Partner tag:", process.env.AMAZON_PARTNER_TAG || "(vazio)");

  // Telegram é opcional (roda mesmo sem), mas vamos avisar
  mustEnv("TELEGRAM_BOT_TOKEN");
  mustEnv("TELEGRAM_CHAT_ID");

  // Primeira execução imediata
  try {
    await runCheckOnce();
  } catch (e) {
    console.log("❌ Erro na primeira execução:", e?.message || e);
  }

  // Loop
  const intervalMs = getIntervalMs();
  setInterval(async () => {
    try {
      await runCheckOnce();
    } catch (e) {
      console.log("❌ Erro no loop:", e?.message || e);
    }
  }, intervalMs);
}

main();
