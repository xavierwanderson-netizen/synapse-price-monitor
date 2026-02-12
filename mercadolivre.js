import axios from 'axios';

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const AFFILIATE_ID = process.env.ML_AFFILIATE_ID;

export async function fetchMLProduct(mlId) {
  try {
    // 1. Gera o Token de Acesso temporário (Client Credentials Flow)
    const authRequest = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const accessToken = authRequest.data.access_token;

    // 2. Busca os detalhes do produto usando o Token oficial
    const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const item = response.data;

    if (item && item.price) {
      // 3. Monta o link de afiliado oficial para monetização
      const affiliateLink = `${item.permalink}?matt_tool=${AFFILIATE_ID}`;

      return {
        id: mlId,
        title: item.title,
        price: item.price,
        url: affiliateLink,
        platform: 'mercadolivre'
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Oficial Mercado Livre (${mlId}):`, error.response?.data?.message || error.message);
    return null;
  }
}
