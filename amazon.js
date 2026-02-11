import amazonPaapi from 'amazon-paapi';

const commonParameters = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  Region: 'Brazil', // Mantenha fixo para evitar erro de variável
  PartnerType: 'Associates',
};

export function buildAffiliateLink(asin) {
  return `https://www.amazon.com.br/dp/${asin}?tag=${process.env.AMAZON_PARTNER_TAG}`;
}

export async function fetchAmazonProduct(asin) {
  const requestParameters = {
    ItemIds: [asin],
    ItemIdType: 'ASIN',
    Resources: ['ItemInfo.Title', 'Offers.Listings.Price'],
  };

  try {
    // RESOLUÇÃO DE MÓDULO: Garante acesso à função getItems
    const api = amazonPaapi.getItems ? amazonPaapi : (amazonPaapi.default || amazonPaapi);
    const data = await api.getItems(commonParameters, requestParameters);

    if (data?.ItemsResult?.Items?.length > 0) {
      const item = data.ItemsResult.Items[0];
      return {
        asin,
        title: item.ItemInfo?.Title?.DisplayValue || "Produto Amazon",
        price: item.Offers?.Listings[0]?.Price?.Amount ? Number(item.Offers.Listings[0].Price.Amount) : null
      };
    }
    return { asin, title: "Indisponível", price: null };
  } catch (error) {
    console.error(`❌ Erro API Amazon (${asin}):`, error.message);
    return { asin, title: "Erro", price: null };
  }
}
