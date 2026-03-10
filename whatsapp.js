import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import pino from "pino";
import qrcode from "qrcode-terminal";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data";
const AUTH_DIR = path.join(DATA_DIR, "wa_auth");
const WA_GROUP_ID = process.env.WA_GROUP_ID;
const WA_GROUP_INVITE = process.env.WA_GROUP_INVITE;

let sock = null;
let isReady = false;

function humanDelay() {
  const ms = 3000 + Math.floor(Math.random() * 5000);
  return new Promise(r => setTimeout(r, ms));
}

async function connectWhatsApp() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, // desativado — gerenciamos manualmente abaixo
    browser: ["Chrome (Linux)", "Chrome", "120.0.0"],
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Imprime o QR manualmente nos logs do Railway
    if (qr) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📱 [WhatsApp] Escaneie o QR Code abaixo:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      qrcode.generate(qr, { small: true });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📱 WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho");
    }

    if (connection === "open") {
      isReady = true;
      console.log("✅ [WhatsApp] Conectado com sucesso!");

      setTimeout(async () => {
        try {
          // Entra no grupo pelo código de convite se definido
          if (WA_GROUP_INVITE) {
            try {
              const groupId = await sock.groupAcceptInvite(WA_GROUP_INVITE);
              console.log(`✅ [WhatsApp] Entrou no grupo! ID: ${groupId}`);
              console.log(`➡️  Adicione no Railway: WA_GROUP_ID=${groupId}`);
            } catch (e) {
              if (e.message?.includes("already") || e.message?.includes("409")) {
                console.log("ℹ️ [WhatsApp] Número já é membro do grupo.");
              } else {
                console.error("❌ [WhatsApp] Erro ao entrar no grupo:", e.message);
              }
            }
          }

          // Lista todos os grupos com ID
          const groups = await sock.groupFetchAllParticipating();
          const list = Object.values(groups);
          console.log(`📋 [WhatsApp] ${list.length} grupo(s) encontrado(s):`);
          list.forEach(g => {
            console.log(`   Nome: "${g.subject}"  →  ID: ${g.id}`);
          });
          console.log("➡️  Copie o ID desejado e adicione como WA_GROUP_ID no Railway.");
        } catch (e) {
          console.error("❌ [WhatsApp] Erro ao processar grupos:", e.message);
        }
      }, 3000);
    }

    if (connection === "close") {
      isReady = false;
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : undefined;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`🔄 [WhatsApp] Reconectando... (código: ${statusCode})`);
        setTimeout(connectWhatsApp, 5000);
      } else {
        console.log("⛔ [WhatsApp] Sessão encerrada. Adicione RESET_WA=true e faça redeploy.");
      }
    }
  });
}

export async function initWhatsApp() {
  if (!WA_GROUP_ID && !WA_GROUP_INVITE) {
    console.log("⚠️ [WhatsApp] WA_GROUP_ID não definido. Notificações WhatsApp desativadas.");
    return;
  }
  await connectWhatsApp();
}

export async function sendWhatsAppMessage(text, imageUrl = null) {
  if (!WA_GROUP_ID) return;
  if (!isReady || !sock) {
    console.log("⚠️ [WhatsApp] Socket não conectado, pulando envio.");
    return;
  }

  try {
    await humanDelay();

    if (imageUrl) {
      await sock.sendMessage(WA_GROUP_ID, {
        image: { url: imageUrl },
        caption: text,
      });
    } else {
      await sock.sendMessage(WA_GROUP_ID, { text });
    }

    console.log("✅ [WhatsApp] Mensagem enviada ao grupo.");
  } catch (err) {
    console.error("❌ [WhatsApp] Erro ao enviar mensagem:", err.message);
    if (imageUrl) {
      try {
        await humanDelay();
        await sock.sendMessage(WA_GROUP_ID, { text });
        console.log("✅ [WhatsApp] Texto enviado (fallback sem imagem).");
      } catch (err2) {
        console.error("❌ [WhatsApp] Falha total:", err2.message);
      }
    }
  }
}
