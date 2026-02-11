import amazonPaapi from 'amazon-paapi';

const config = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Region: 'Brazil',
  PartnerType: 'Associates',
};

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  return `https://www.amazon.com.br/dp/${asin}?tag=${tag}`;
}

export async function fetchAmazonProduct(asin) {
  const requestParameters = {
    ItemIds: [asin],
    ItemIdType: 'ASIN',
    Resources: ['ItemInfo.Title', 'Offers.Listings.Price'],
  };

  try {
    const api = amazonPaapi.getItems ? amazonPaapi : amazonPaapi.default;
    
    if (!api || typeof api.getItems !== 'function') {
      throw new Error("Erro de compatibilidade da biblioteca.");
    }

    const data = await api.getItems(config, requestParameters);

    if (data && data.ItemsResult && data.ItemsResult.Items.length > 0) {
      const item = data.ItemsResult.Items[0];
      const title = item.ItemInfo?.Title?.DisplayValue || "Produto Amazon";
      const price = item.Offers?.Listings[0]?.Price?.Amount || null;

      return { asin, title, price: price ? Number(price) : null };
    }
    return { asin, title: "Indisponível", price: null };
  } catch (error) {
    console.error(`❌ Erro PA-API ASIN ${asin}:`, error.message);
    throw error;
  }
}
