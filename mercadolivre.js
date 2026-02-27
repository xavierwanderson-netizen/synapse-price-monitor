import axios from "axios";
import fs from "fs";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data";
const TOKENS_PATH = `${DATA_DIR}/ml_tokens_v2.json`;
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function saveTokens(tokens) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log("✅ ML: Tokens salvos com sucesso.");
  } catch (err) {
    console.error("❌ ML: Erro ao gravar tokens:", err.message);
  }
}

async function getTokens() {
  let tokens = {};

  if (fs.existsSync(TOKENS_PATH)) {
    tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  } else if (process.env.ML_INITIAL_CODE) {
    console.log("🔄 ML: Trocando INITIAL_CODE pelo primeiro token...");
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("client_id", process.env.ML_CLIENT_ID);
      params.append("client_secret", process.env.ML_CLIENT_SECRET);
      params.append("code", process.env.ML_INITIAL_CODE);
      params.append("redirect_uri", process.env.ML_REDIRECT_URI);
      const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params);
      tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
      };
      await saveTokens(tokens);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      if (status === 400 || status === 401) {
        console.error(`❌ ML: INITIAL_CODE expirado ou inválido. (${status}: ${msg})`);
        console.error("👉 Gere um novo TG-... no DevCenter e atualize ML_INITIAL_CODE no Railway.");
      } else {
        console.error("❌ ML: Erro inesperado na troca de token:", msg);
      }
      return {};
    }
  } else {
    console.warn("⚠️ ML: Nenhum token salvo e ML_INITIAL_CODE não definido.");
    return {};
  }

  // 🔴 CORREÇÃO: era `if`, agora é `else if` para não renovar token recém-criado
  if (tokens.access_token && Date.now() >= tokens.expires_at - 60000) {
    console.log("🔄 ML: Renovando Access Token...");
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("client_id", process.env.ML_CLIENT_ID);
      params.append("client_secret", process.env.ML_CLIENT_SECRET);
      params.append("refresh_token", tokens.refresh_token);
      const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params);
      tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
      };
      await saveTokens(tokens);
    } catch (err) {
      console.error("❌ ML: Falha ao renovar token:", err.response?.data?.message || err.message);
      return {};
    }
  }

  return tokens;
}

export async function fetchMLProduct(mlId) {
  const cleanId = String(mlId).trim().toUpperCase();
  const tokens = await getTokens();

  if (!tokens.access_token) {
    console.warn(`⚠️ ML: Pulando ${cleanId} - Token não disponível.`);
    return null;
  }

  try {
    const res = await axios.get(`https://api.mercadolibre.com/items/${cleanId}`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "User-Agent": AGENT,
      },
      timeout: 10000,
    });

    return {
      id: `ml_${cleanId}`,
      title: res.data.title,
      price: res.data.price,
      platform: "mercadolivre",
      url: process.env.ML_AFFILIATE_ID
        ? `${res.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`
        : res.data.permalink,
      image: res.data.thumbnail,
    };
  } catch (error) {
    console.error(`❌ Erro ML (${cleanId}):`, error.response?.status || error.message);
    return null;
  }
}
