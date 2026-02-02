import "dotenv/config";
import { runCheckOnce } from "./notifier.js";

const minutes = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const intervalMs = Math.max(1, minutes) * 60 * 1000;

async function loop() {
  try {
    console.log("✅ Rodando verificação...");
    await runCheckOnce();
    console.log("✅ Verificação finalizada.");
  } catch (err) {
    console.error("❌ Erro no loop:", err?.message || err);
  }
}

// roda uma vez ao iniciar
await loop();

// mantém rodando para sempre
setInterval(loop, intervalMs);

// impede Railway de “encerrar”
process.stdin.resume();
console.log(`⏱️ Agendado para rodar a cada ${minutes} minutos.`);
