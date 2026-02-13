import axios from "axios";
import fs from "fs";

const TOKENS_PATH = "/data/ml_tokens_v2.json";
const COMMON_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

async function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(tokens) {
  if (!tokens.refresh_token) {
    throw new Error("Refresh token ausente");
  }

  const { data } = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    {
      grant_type: "refresh_token",
      client_id: process.env.ML_APP_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: tokens.refresh_token
    },
    { timeout: 12000 }
  );

  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  };

  await saveTokens(newTokens);
  return newTokens;
}

export async function fetchMLProduct(mlId) {
  if (!mlId) return null;

  try {
    let tokens = await loadTokens();
    let data = null;

    // 1. Gerenciamento de Token
    if (
      tokens.access_token &&
      tokens.refresh_token &&
      Date.now() >= (tokens.expires_at - 60000)
    ) {
      try {
        tokens = await refreshAccessToken(tokens);
      } catch (err) {
        console.warn(`⚠️ Falha ao renovar token ML: ${err.message}`);
      }
    }

    // 2. Tentativa Autenticada
    if (tokens.access_token) {
      try {
        const res = await axios.get(
          `https://api.mercadolibre.com/items/${mlId}`,
          {
            headers: { 
              Authorization: `Bearer ${tokens.access_token}`,
              "User-Agent": COMMON_USER_AGENT
            },
            timeout: 10000
          }
        );
        data = res.data;
      } catch (err) {
        // Se for 403 ou 401, tentaremos o fallback abaixo
        console.warn(`ℹ️ Tentativa autenticada falhou para ${mlId}, tentando fallback público...`);
      }
    }

    // 3. Fallback Público (Crucial para evitar 403 de datacenter)
    if (!data) {
      const res = await axios.get(
        `https://api.mercadolibre.com/items/${mlId}`,
        { 
          headers: { "User-Agent": COMMON_USER_AGENT },
          timeout: 10000 
        }
      );
      data = res.data;
    }

    if (!data || !data.price) return null;

    const affiliateId = process.env.ML_AFFILIATE_ID;
    const url = affiliateId
      ? `${data.permalink}?matt_tool=${affiliateId}`
      : data.permalink;

    return {
      id: `ml_${mlId}`,
      title: data.title,
      price: data.price,
      platform: "mercadolivre",
      url,
      image: data.thumbnail || null
    };
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.message);
    return null;
  }
}
