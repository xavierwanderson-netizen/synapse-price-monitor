import "dotenv/config";
import { runCheckOnce } from "./notifier.js";

// intervalo em minutos (Railway Variable)
const MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const INTERVAL = Math.max(1, MINUTES) * 60 * 1000;

async function loop() {
  try {
    console.log("🔁 Iniciando verificação de preços...");
    await runCheckOnce();
    console.log("✅ Verificação concluída.");
  } catch (err) {
    console.error("❌ Erro no loop principal:", err?.message || err);
  }
}

// roda imediatamente ao subir
await loop();

// mantém processo vivo
setInterval(loop, INTERVAL);
process.stdin.resume();

console.log(`⏱️ Monitor ativo | intervalo: ${MINUTES} minutos`);
