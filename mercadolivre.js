import axios from "axios";
import fs from "fs";

const TOKENS_PATH = "/data/ml_tokens_v2.json";
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function getFirstToken() {
  const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", {
    grant_type: "authorization_code",
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    code: process.env.ML_INITIAL_CODE,
    redirect_uri: process.env.ML_REDIRECT_URI
  });
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  };
  await saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(tokens) {
  const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", {
    grant_type: "refresh_token",
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: tokens.refresh_token
  });
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000
  };
  await saveTokens(newTokens);
  return newTokens;
}

export async function fetchMLProduct(mlId) {
  try {
    let tokens = {};
    if (fs.existsSync(TOKENS_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
    } else if (process.env.ML_INITIAL_CODE) {
      tokens = await getFirstToken();
    }

    if (tokens.access_token && Date.now() >= (tokens.expires_at - 60000)) {
      tokens = await refreshAccessToken(tokens);
    }

    const res = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
      headers: { 
        "Authorization": tokens.access_token ? `Bearer ${tokens.access_token}` : undefined,
        "User-Agent": AGENT 
      },
      timeout: 10000
    });

    return {
      id: `ml_${mlId}`,
      title: res.data.title,
      price: res.data.price,
      platform: "mercadolivre",
      url: `${res.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID || ''}`,
      image: res.data.thumbnail
    };
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.response?.status || error.message);
    return null;
  }
}
