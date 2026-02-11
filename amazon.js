import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const amazonPaapi = require('amazon-paapi');

const config = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Region: 'Brazil',
  PartnerType: 'Associates',
};

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const base = `https://www.amazon.com.br/dp/${asin}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

export async function fetchAmazonProduct(asin) {
  const requestParameters = {
    ItemIds: [asin],
    ItemIdType: 'ASIN',
    Resources: ['ItemInfo.Title', 'Offers.Listings.Price'],
  };

  try {
    // Agora chamamos a biblioteca de forma direta e segura
    const data = await amazonPaapi.getItems(config, requestParameters);

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

    return { asin, title: "Indisponível", price: null };

  } catch (error) {
    if (error.status === 429) {
      console.warn(`⚠️ Limite atingido para ASIN ${asin}.`);
    } else {
      console.error(`❌ Erro técnico PA-API (${asin}):`, error.message);
    }
    throw error;
  }
}
