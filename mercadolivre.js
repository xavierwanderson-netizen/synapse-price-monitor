import axios from 'axios';
import fs from 'fs';

const TOKEN_PATH = '/.data/ml_tokens_v2.json';

export async function fetchMLProduct(mlId) {
  if (!mlId) return null;

  try {
    let accessToken = null;
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      accessToken = tokens.access_token;
    }

    try {
      // Tenta com Token
      const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      });
      return {
        id: mlId,
        title: response.data.title,
        price: response.data.price,
        url: `${response.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
        platform: 'mercadolivre'
      };
    } catch (err) {
      // FALLBACK: Busca pública se o token falhar
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
