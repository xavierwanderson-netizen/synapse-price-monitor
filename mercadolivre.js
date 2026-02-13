import axios from "axios";
import fs from "fs";

const TOKENS_PATH = "/data/ml_tokens_v2.json";

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

    // tenta renovar apenas se tiver refresh token
    if (
      tokens.access_token &&
      tokens.refresh_token &&
      Date.now() >= (tokens.expires_at - 60000)
    ) {
      tokens = await refreshAccessToken(tokens);
    }

    let data;

    // tenta com autenticação
    if (tokens.access_token) {
      try {
        const res = await axios.get(
          `https://api.mercadolibre.com/items/${mlId}`,
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            timeout: 12000
          }
        );
        data = res.data;
      } catch {
        data = null;
      }
    }

    // fallback público (sem token)
    if (!data) {
      const res = await axios.get(
        `https://api.mercadolibre.com/items/${mlId}`,
        { timeout: 12000 }
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
