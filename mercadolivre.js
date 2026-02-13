import axios from 'axios';
import fs from 'fs';

const TOKEN_PATH = '/.data/ml_tokens_v2.json';

export async function fetchMLProduct(mlId) {
  if (!mlId) return null;

  try {
    let tokens = { access_token: null };
    if (fs.existsSync(TOKEN_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    try {
      // Tenta com o Token para garantir métricas
      const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
        headers: { 'Authorization': `Bearer ${tokens?.access_token}` }
      });
      
      return {
        id: mlId,
        title: response.data.title,
        price: response.data.price,
        url: `${response.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
        platform: 'mercadolivre'
      };
    } catch (authError) {
      // Plano B: Se o token falhar ou der 403, faz busca pública
      const publicRes = await axios.get(`https://api.mercadolibre.com/items/${mlId}`);
      return {
        id: mlId,
        title: publicRes.data.title,
        price: publicRes.data.price,
        url: `${publicRes.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
        platform: 'mercadolivre'
      };
    }
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.message);
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
  return res.data;
}
