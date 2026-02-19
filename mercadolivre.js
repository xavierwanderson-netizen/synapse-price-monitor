import axios from "axios";
import fs from "fs";

// Ajustado para /.data para manter compatibilidade com seu volume atual
const TOKENS_PATH = "/.data/ml_tokens_v2.json"; 
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function saveTokens(tokens) {
  try {
    // Garante que a pasta oculta exista antes de gravar
    const dir = "/.data";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log("✅ ML: Tokens salvos com sucesso no volume persistente /.data");
  } catch (err) {
    console.error("❌ ML: Erro ao gravar no volume /.data:", err.message);
  }
}

async function getFirstToken() {
  console.log("🔄 ML: Trocando INITIAL_CODE pelo primeiro token...");
  
  // Envio obrigatório via Body x-www-form-urlencoded conforme documentação
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("client_id", process.env.ML_CLIENT_ID);
  params.append("client_secret", process.env.ML_CLIENT_SECRET);
  params.append("code", process.env.ML_INITIAL_CODE);
  params.append("redirect_uri", process.env.ML_REDIRECT_URI);

  const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
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
  console.log("🔄 ML: Renovando Access Token com Refresh Token...");
  
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("client_id", process.env.ML_CLIENT_ID);
  params.append("client_secret", process.env.ML_CLIENT_SECRET);
  params.append("refresh_token", tokens.refresh_token);

  const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token, // Refresh token é de uso único
    expires_at: Date.now() + data.expires_in * 1000
  };
  await saveTokens(newTokens);
  return newTokens;
}

export async function fetchMLProduct(mlId) {
  // Limpeza sintática e Allow List (MLB + Números)
  const cleanId = String(mlId).trim().toUpperCase();

  try {
    let tokens = {};
    if (fs.existsSync(TOKENS_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
    } else if (process.env.ML_INITIAL_CODE) {
      tokens = await getFirstToken();
    }

    // Renovação automática antes da expiração
    if (tokens.access_token && Date.now() >= (tokens.expires_at - 60000)) {
      tokens = await refreshAccessToken(tokens);
    }

    // Header de autorização obrigatório em todas as chamadas
    const res = await axios.get(`https://api.mercadolibre.com/items/${cleanId}`, {
      headers: { 
        "Authorization": `Bearer ${tokens.access_token}`,
        "User-Agent": AGENT 
      },
      timeout: 10000
    });

    return {
      id: `ml_${cleanId}`,
      title: res.data.title,
      price: res.data.price,
      platform: "mercadolivre",
      url: `${res.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID || ''}`,
      image: res.data.thumbnail
    };
  } catch (error) {
    const status = error.response?.status;
    console.error(`❌ Erro ML (${cleanId}):`, status || error.message);
    
    if (status === 400) {
      console.warn("⚠️ ML: Erro 400. Verifique se REDIRECT_URI no Railway possui https:// e coincide com o painel.");
    }
    return null;
  }
}
