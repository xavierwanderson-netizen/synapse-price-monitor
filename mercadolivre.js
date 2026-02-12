import axios from 'axios';
import fs from 'fs';

const TOKEN_PATH = '/.data/ml_tokens.json';

export async function fetchMLProduct(mlId) {
  try {
    let tokens = { access_token: null, refresh_token: null };

    // 1. Tenta carregar tokens salvos no volume persistente
    if (fs.existsSync(TOKEN_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    // 2. Se não tem tokens, faz o login inicial
    if (!tokens.access_token) {
      tokens = await getInitialToken();
    }

    // 3. Tenta buscar o produto
    try {
      const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
      
      return {
        id: mlId,
        title: response.data.title,
        price: response.data.price,
        url: `${response.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
        platform: 'mercadolivre'
      };
    } catch (err) {
      // 4. Se o token expirou (401), renova automaticamente
      if (err.response?.status === 401) {
        tokens = await refreshMLToken(tokens.refresh_token);
        return fetchMLProduct(mlId); // Tenta de novo com o novo token
      }
      throw err;
    }
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.response?.data?.message || error.message);
    return null;
  }
}

async function getInitialToken() {
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    code: process.env.ML_INITIAL_CODE,
    redirect_uri: process.env.ML_REDIRECT_URI
  });
  const res = await axios.post('https://api.mercadolibre.com/oauth/token', data);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(res.data));
  console.log("✅ Primeiro Token gerado e salvo no volume!");
  return res.data;
}

async function refreshMLToken(oldRefreshToken) {
  const data = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: oldRefreshToken
  });
  const res = await axios.post('https://api.mercadolibre.com/oauth/token', data);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(res.data));
  console.log("🔄 Token renovado com sucesso via Refresh Token!");
  return res.data;
}
