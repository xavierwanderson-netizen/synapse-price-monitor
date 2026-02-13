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

    if (!tokens.access_token || Date.now() >= (tokens.expires_at - 60000)) {
      tokens = await refreshAccessToken(tokens);
    }

    try {
      const { data } = await axios.get(
        `https://api.mercadolibre.com/items/${mlId}`,
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          timeout: 12000
        }
      );

      const affiliateId = process.env.ML_AFFILIATE_ID;
      const url = affiliateId
        ? `${data.permalink}?matt_tool=${affiliateId}`
        : data.permalink;

      return {
        id: mlId,
        title: data.title,
        price: data.price,
        platform: "mercadolivre",
        url
      };
    } catch {
      const { data: pubData } = await axios.get(
        `https://api.mercadolibre.com/items/${mlId}`,
        { timeout: 12000 }
      );

      const affiliateId = process.env.ML_AFFILIATE_ID;
      const url = affiliateId
        ? `${pubData.permalink}?matt_tool=${affiliateId}`
        : pubData.permalink;

      return {
        id: mlId,
        title: pubData.title,
        price: pubData.price,
        platform: "mercadolivre",
        url
      };
    }
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.message);
    return null;
  }
}
