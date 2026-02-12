import "dotenv/config";
import fs from 'fs/promises';
import { runCheckOnce } from "./notifier.js";

async function main() {
  console.log("🚀 Iniciando Price Monitor");
  
  // Função que lê os produtos e manda pro robô
  async function loadAndRun() {
    try {
      const data = await fs.readFile('./products.json', 'utf-8');
      const products = JSON.parse(data);
      // Aqui está a correção: passamos a lista para o notifier
      await runCheckOnce(products);
    } catch (e) {
      console.log("❌ Erro ao carregar produtos:", e?.message || e);
    }
  }

  // Roda agora
  await loadAndRun();

  // Roda a cada X minutos (padrão 60)
  const interval = (parseInt(process.env.CHECK_INTERVAL_MINUTES) || 60) * 60 * 1000;
  setInterval(loadAndRun, interval);
}

main().catch(console.error);
