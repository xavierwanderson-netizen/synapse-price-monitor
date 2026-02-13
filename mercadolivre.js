import axios from "axios";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.VOLUME_PATH || "/data";
const TOKEN_FILE = path.join(DATA_DIR, "ml_tokens_v2.json");

async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { 
      access_token: process.env.ML_ACCESS_TOKEN || null, 
      refresh_token: process.env.ML_REFRESH_TOKEN || null,
      expires_at: process.env.ML_EXPIRES_AT ? Number(process.env.ML_EXPIRES_AT) : 0 
    };
  }
}

async function refreshAccessToken(tokens) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: tokens.refresh_token
  });
  const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", body);
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(next, null, 2));
  return next;
}

export async function fetchMLProduct(mlId) {
  if (!mlId) return null;
  try {
    let tokens = await loadTokens();
    if (!tokens.access_token || Date.now() >= (tokens.expires_at - 60000)) {
      tokens = await refreshAccessToken(tokens);
    }
    try {
      const { data } = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeout: 12000
      });
      return { id: mlId, title: data.title, price: data.price, platform: "mercadolivre", url: data.permalink };
    } catch {
      const { data: pubData } = await axios.get(`https://api.mercadolibre.com/items/${mlId}`);
      return { id: mlId, title: pubData.title, price: pubData.price, platform: "mercadolivre", url: pubData.permalink };
    }
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.message);
    return null;
  }
}
