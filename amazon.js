import { DefaultApi } from 'creatorsapi-nodejs-sdk';

// Configuração com as NOVAS credenciais OAuth 2.0
const apiInstance = new DefaultApi({
  credentialId: process.env.AMAZON_CREDENTIAL_ID,
  credentialSecret: process.env.AMAZON_CREDENTIAL_SECRET,
  version: "2.1", // Versão para região NA/BR
  marketplace: "www.amazon.com.br"
});

export async function fetchAmazonProduct(asin) {
  const getItemsRequest = {
    itemIds: [asin],
    itemIdType: 'ASIN',
    marketplace: 'www.amazon.com.br',
    partnerTag: process.env.AMAZON_PARTNER_TAG,
    resources: ['itemInfo.title'] // Note o lowerCamelCase obrigatório
  };

  try {
    const data = await apiInstance.getItems(getItemsRequest);
    if (data?.itemsResult?.items?.length > 0) {
      const item = data.itemsResult.items[0];
      return {
        asin,
        title: item.itemInfo?.title?.displayValue || "Produto Amazon",
        price: null // ALERTA: Creators API requer fluxo diferente para preços
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Creators API (${asin}):`, error.message);
    return null;
  }
}
