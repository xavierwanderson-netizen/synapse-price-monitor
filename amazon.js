import amazonPaapi from 'amazon-paapi';

/**
 * Configuração da PA-API v5
 * Utiliza as variáveis que você já tem configuradas no Railway.
 */
const commonParameters = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Region: process.env.AMAZON_REGION || 'Brazil', 
  PartnerType: 'Associates',
};

/**
 * Constrói o link de afiliado oficial usando sua Tag.
 */
export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  return `https://www.amazon.com.br/dp/${asin}?tag=${tag}`;
}

/**
 * Busca dados do produto via API Oficial (Sem risco de CAPTCHA).
 */
export async function fetchAmazonProduct(asin) {
  const requestParameters = {
    ItemIds: [asin],
    ItemIdType: 'ASIN',
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
    ],
  };

  try {
    const data = await amazonPaapi.getItems(commonParameters, requestParameters);

    if (data && data.ItemsResult && data.ItemsResult.Items.length > 0) {
      const item = data.ItemsResult.Items[0];
      
      const title = item.ItemInfo.Title.DisplayValue;
      // O preço na API vem como um valor numérico direto
      const price = item.Offers?.Listings[0]?.Price?.Amount || null;

      return {
        asin,
        title,
        price: price ? Number(price) : null
      };
    }

    return { asin, title: "Produto Indisponível", price: null };

  } catch (error) {
    // Tratamento de erro específico para a API
    if (error.status === 429) {
      throw new Error("PA-API_LIMIT_EXCEEDED");
    }
    console.error(`❌ Erro PA-API ASIN ${asin}:`, error.message);
    throw error;
  }
}
