import amazonPaapi from 'amazon-paapi';

/**
 * Configuração da PA-API v5 utilizando as suas Service Variables do Railway
 */
const commonParameters = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Region: process.env.AMAZON_REGION || 'Brazil',
  PartnerType: 'Associates',
};

/**
 * Constrói o link de afiliado oficial
 */
export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const base = `https://www.amazon.com.br/dp/${asin}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

/**
 * Obtém dados do produto via API oficial da Amazon
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
      
      const title = item.ItemInfo?.Title?.DisplayValue || "Produto Amazon";
      const price = item.Offers?.Listings[0]?.Price?.Amount || null;

      return {
        asin,
        title,
        price: price ? Number(price) : null
      };
    }

    return { asin, title: "Produto não encontrado", price: null };

  } catch (error) {
    if (error.status === 429) {
      console.warn(`⚠️ Limite da PA-API atingido para o ASIN ${asin}.`);
    } else {
      console.error(`❌ Erro na PA-API para ASIN ${asin}:`, error.message);
    }
    throw error;
  }
}
