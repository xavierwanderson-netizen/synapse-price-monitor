import axios from "axios";
import fs from "fs";

const TOKENS_PATH = "/.data/ml_tokens_v2.json"; 
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function saveTokens(tokens) {
  try {
    const dir = "/.data";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    // Troca INITIAL_CODE usando Form-Data
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", process.env.ML_CLIENT_ID);
    params.append("client_secret", process.env.ML_CLIENT_SECRET);
    params.append("code", process.env.ML_INITIAL_CODE);
    params.append("redirect_uri", process.env.ML_REDIRECT_URI);

    const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params);
    tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
    await saveTokens(tokens);
  }
  
  if (tokens.access_token && Date.now() >= (tokens.expires_at - 60000)) {
    // Renovação automática via Refresh Token
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", process.env.ML_CLIENT_ID);
    params.append("client_secret", process.env.ML_CLIENT_SECRET);
    params.append("refresh_token", tokens.refresh_token);

    const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params);
    tokens = { access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
    await saveTokens(tokens);
  }
  return tokens;
}

/**
 * Busca produtos usando Multiget para até 20 IDs por vez
 */
export async function fetchMLProductsBatch(mlIds) {
  const tokens = await getTokens();
  if (!tokens.access_token) return [];

  try {
    // Solicita apenas os campos necessários (attributes) para ganhar performance
    const idsString = mlIds.join(',');
    const res = await axios.get(`https://api.mercadolibre.com/items?ids=${idsString}&attributes=id,price,title,permalink,thumbnail`, {
      headers: { "Authorization": `Bearer ${tokens.access_token}`, "User-Agent": AGENT }
    });

    // Filtra apenas os que retornaram código 200
    return res.data.filter(item => item.code === 200).map(item => ({
      id: `ml_${item.body.id}`,
      title: item.body.title,
      price: item.body.price,
      platform: "mercadolivre",
      url: `${item.body.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID || ''}`,
      image: item.body.thumbnail
    }));
  } catch (error) {
    console.error("❌ Erro no Batch ML:", error.response?.status || error.message);
    return [];
  }
}
