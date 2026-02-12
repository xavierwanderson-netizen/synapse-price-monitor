import axios from 'axios';

export async function fetchMLProduct(mlId) {
  try {
    // Consulta pública (evita o erro UNAUTHORIZED)
    const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`);
    const item = response.data;

    if (item && item.price) {
      const affiliateId = process.env.ML_AFFILIATE_ID;
      const affiliateLink = `${item.permalink}?matt_tool=${affiliateId}`;

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
    console.error(`❌ Erro Mercado Livre (${mlId}):`, error.message);
    return null;
  }
}
