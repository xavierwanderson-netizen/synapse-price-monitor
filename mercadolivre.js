import axios from 'axios';

export async function fetchMLProduct(mlId) {
  try {
    // 1. Obtém o token enviando parâmetros no corpo (Recomendação Oficial)
    const authData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET
    });

    const tokenRes = await axios.post('https://api.mercadolibre.com/oauth/token', authData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // 2. Usa o token no Header (Bearer) para evitar o Erro 403
    const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
      headers: { 'Authorization': `Bearer ${tokenRes.data.access_token}` }
    });

    const item = response.data;
    return {
      id: mlId,
      title: item.title,
      price: item.price,
      url: `${item.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
      platform: 'mercadolivre'
    };
  } catch (error) {
    console.error(`❌ Erro ML (${mlId}):`, error.response?.data?.message || error.message);
    return null;
  }
}
