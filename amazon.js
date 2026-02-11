import amazonPaapi from 'amazon-paapi';

// Configuração centralizada
const config = {
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
 * Obtém dados do produto via API oficial
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
    // Garantindo a captura correta do método getItems
    const common = amazonPaapi.getItems ? amazonPaapi : amazonPaapi.default;
    
    if (!common) {
      throw new Error("Falha crítica: Biblioteca amazon-paapi não carregada corretamente.");
    }

    const data = await common.getItems(config, requestParameters);

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
    // Tratamento de limite (Too Many Requests)
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
      console.warn(`⚠️ Limite da PA-API atingido para o ASIN ${asin}. Aguardando próximo ciclo.`);
    } else {
      console.error(`❌ Erro técnico PA-API ASIN ${asin}:`, error.message);
    }
    throw error;
  }
}
