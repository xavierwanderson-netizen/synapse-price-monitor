import "dotenv/config";
import http from "http";
import { runCheckOnce } from "./notifier.js";

/**
 * ===============================
 * 1) SERVIDOR HTTP (HEALTHCHECK)
 * ===============================
 */
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`🌐 Healthcheck ativo na porta ${PORT}`);
});

/**
 * ===============================
 * 2) LOOP DO MONITOR
 * ===============================
 */
const MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const INTERVAL = Math.max(1, MINUTES) * 60 * 1000;

async function loop() {
  try {
    console.log("🔁 Rodando verificação de preços...");
    await runCheckOnce();
    console.log("✅ Verificação finalizada.");
  } catch (err) {
    console.error("❌ Erro no loop:", err?.message || err);
  }
}

// roda imediatamente
await loop();

// agenda
setInterval(loop, INTERVAL);

// mantém processo vivo
process.stdin.resume();

console.log(`⏱️ Monitor ativo | intervalo: ${MINUTES} minutos`);
