import amazonPaapi from 'amazon-paapi';

// Configuração extraída das suas variáveis de ambiente
const commonParameters = {
  AccessKey: process.env.AMAZON_ACCESS_KEY,
  SecretKey: process.env.AMAZON_SECRET_KEY,
  PartnerTag: process.env.AMAZON_PARTNER_TAG,
  // A API oficial espera 'Brazil', mas aceita mapeamento da sua variável 'br'
  Region: process.env.AMAZON_REGION === 'br' ? 'Brazil' : 'Brazil',
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
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
    ],
  };

  try {
    // RESOLUÇÃO DEFINITIVA DO ERRO DE IMPORTAÇÃO
    const api = amazonPaapi.getItems ? amazonPaapi : amazonPaapi.default;
    
    if (!api || typeof api.getItems !== 'function') {
      throw new Error("Falha ao carregar getItems da biblioteca amazon-paapi.");
    }

    const data = await api.getItems(commonParameters, requestParameters);

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
    // Tratamento de erro 429 (Too Many Requests)
    if (error.status === 429) {
      console.warn(`⚠️ PA-API: Limite de requisições atingido para ASIN ${asin}.`);
    } else {
      console.error(`❌ Erro técnico PA-API (${asin}):`, error.message);
    }
    throw error;
  }
}
