import axios from "axios";
import crypto from "crypto";

/**
 * Função Auxiliar: Gera Assinatura SHA256 Exata
 */
function getSignature(appId, appKey, timestamp) {
  // A documentação exige a ordem: appId + timestamp + appKey
  const baseStr = appId + timestamp + appKey;
  return crypto.createHash("sha256").update(baseStr).digest("hex");
}

/**
 * MELHORIA: Encurtador de Links (shope.ee)
 * Executado apenas após a captura bem-sucedida do preço.
 */
export async function generateShopeeShortLink(originUrl) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = getSignature(appId, appKey, timestamp);

    const query = `mutation{generateShortLink(input:{originUrl:"${originUrl}"}){shortLink}}`;

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      { query },
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    return data?.data?.generateShortLink?.shortLink || originUrl;
  } catch (error) {
    return originUrl; // Em caso de erro 10030 ou falha, retorna link longo
  }
}

/**
 * FUNÇÃO PRINCIPAL: Captura de Preço v2
 */
export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

    if (!appId || !appKey) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = getSignature(appId, appKey, timestamp);

    // Query minificada para evitar erros de caractere invisível
    const query = `query{productOfferV2(itemId:${itemId},shopId:${shopId}){nodes{productName,priceMin,productLink,imageUrl}}}`;

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      { query },
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    // Tratamento de Erros v2 (Identidade, Expiração ou Rate Limit)
    if (data.errors) {
      const errCode = data.errors[0].extensions?.code || "10020";
      console.error(`⚠️ Shopee API Error [${errCode}] (${itemId}): ${data.errors[0].message}`);
      return null;
    }

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (!node || !node.priceMin) return null;

    // Integração da melhoria: tenta encurtar o link original
    const finalUrl = await generateShopeeShortLink(node.productLink);

    return {
      id: `shopee_${itemId}`,
      title: node.productName,
      price: parseFloat(node.priceMin),
      url: finalUrl,
      image: node.imageUrl || null,
      platform: "shopee"
    };
  } catch (error) {
    console.error(`❌ Falha Crítica Shopee (${itemId}): ${error.message}`);
    return null;
  }
}
