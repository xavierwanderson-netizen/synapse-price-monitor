import "dotenv/config";
import fs from 'fs/promises';
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
  console.log("🚀 Iniciando Amazon Price Monitor");
  console.log("⏱️ Intervalo (min):", process.env.CHECK_INTERVAL_MINUTES || 30);
  console.log("🏷️ Partner tag:", process.env.AMAZON_PARTNER_TAG || "(vazio)");

  mustEnv("TELEGRAM_BOT_TOKEN");
  mustEnv("TELEGRAM_CHAT_ID");

  // Função interna para carregar produtos e rodar a verificação
  async function loadAndRun() {
    try {
      const data = await fs.readFile('./products.json', 'utf-8');
      const products = JSON.parse(data);
      // Agora passamos os produtos para o notifier
      await runCheckOnce(products);
    } catch (e) {
      console.log("❌ Erro ao processar produtos:", e?.message || e);
    }
  }

  // Primeira execução
  await loadAndRun();

  const intervalMs = getIntervalMs();

  setInterval(async () => {
    await loadAndRun();
  }, intervalMs);
}

main();
