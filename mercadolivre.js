import axios from 'axios';

const mlAffiliateId = process.env.ML_AFFILIATE_ID || 'SEU_ID_DE_AFILIADO';

export async function fetchMLProduct(mlId) {
  try {
    // Busca dados do produto na API pública do Mercado Livre
    const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`);
    const item = response.data;

    if (item && item.price) {
      // Gera o link de afiliado usando o seu matt_tool (ID de monetização)
      const affiliateLink = `${item.permalink}?matt_tool=${mlAffiliateId}`;

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
