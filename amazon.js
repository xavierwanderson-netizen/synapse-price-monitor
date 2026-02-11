import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const creatorsApi = require('creatorsapi-nodejs-sdk');

const apiInstance = new creatorsApi.DefaultApi({
  credentialId: process.env.AMAZON_CREDENTIAL_ID,
  credentialSecret: process.env.AMAZON_CREDENTIAL_SECRET,
  version: "2.1",
  marketplace: "www.amazon.com.br"
});

export async function fetchAmazonProduct(asin) {
  const request = {
    itemIds: [asin],
    partnerTag: process.env.AMAZON_PARTNER_TAG,
    marketplace: 'www.amazon.com.br',
    currencyOfPreference: 'BRL',
    resources: ['itemInfo.title', 'offersV2.listings.price']
  };

  try {
    const data = await apiInstance.getItems(request);
    const item = data?.itemResults?.items?.[0];
    
    if (item) {
      return {
        asin,
        title: item.itemInfo?.title?.displayValue,
        price: item.offersV2?.listings?.[0]?.price?.money?.amount
      };
    }
    return null;
  } catch (error) {
    // Tratamento de erros baseado na documentação oficial
    const type = error.response?.data?.type;
    const reason = error.response?.data?.reason;

    if (type === "UnauthorizedException") {
      console.error("🔑 Erro: Token expirado ou inválido. Verifique suas credenciais.");
    } else if (reason === "AssociateNotEligible") {
      console.error("🚫 Bloqueio: Sua conta não atingiu 10 vendas nos últimos 30 dias.");
    } else if (type === "ThrottleException") {
      console.error("⏳ Alerta: Limite de requisições excedido. Aguardando...");
    } else {
      console.error(`❌ Erro API (${asin}):`, error.message);
    }
    return null;
  }
}
