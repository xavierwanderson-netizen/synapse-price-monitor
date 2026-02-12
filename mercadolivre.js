import axios from 'axios';

export async function fetchMLProduct(mlId) {
  try {
    // 1. Obtém o Token usando as credenciais e o código inicial
    const authData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code: process.env.ML_INITIAL_CODE,
      redirect_uri: process.env.ML_REDIRECT_URI
    });

    const tokenRes = await axios.post('https://api.mercadolibre.com/oauth/token', authData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // 2. Consulta o produto com o Token no Header
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
