import axios from "axios";
import crypto from "crypto";

/**
 * MELHORIA: Encurtador de Links (shope.ee)
 */
export async function generateShopeeShortLink(originUrl) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();
    const timestamp = Math.floor(Date.now() / 1000);

    // Mutation conforme documentação oficial
    const query = `mutation{generateShortLink(input:{originUrl:"${originUrl}",subIds:["telegram","monitor_precos"]}){shortLink}}`;
    const payload = JSON.stringify({ query });

    // Assinatura oficial: AppId + Timestamp + Payload + Secret
    const baseStr = appId + timestamp + payload + appKey;
    const signature = crypto.createHash("sha256").update(baseStr).digest("hex");

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      payload,
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
          "Content-Type": "application/json"
        }
      }
    );

    return data?.data?.generateShortLink?.shortLink || originUrl;
  } catch (error) {
    return originUrl;
  }
}

/**
 * FUNÇÃO PRINCIPAL: Captura de Preço v2
 * Certifique-se de que o nome 'fetchShopeeProduct' esteja EXATAMENTE assim para o index.js
 */
export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

    if (!appId || !appKey) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    
    // Query GraphQL sem espaços extras para evitar erros de assinatura
    const query = `query{productOfferV2(itemId:${itemId},shopId:${shopId}){nodes{productName,priceMin,productLink,imageUrl}}}`;
    const payload = JSON.stringify({ query });

    // Signature oficial com inclusão do PAYLOAD
    const baseStr = appId + timestamp + payload + appKey;
    const signature = crypto
      .createHash("sha256")
      .update(baseStr)
      .digest("hex");

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      payload,
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    // Tratamento de erros v2
    if (data.errors) {
      const err = data.errors[0];
      console.error(`⚠️ Shopee API Error [${err.extensions?.code}]: ${err.message}`);
      return null;
    }

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (!node || !node.priceMin) return null;

    // Converte para link curto antes de retornar
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
    console.error(`❌ Erro Crítico Shopee (${itemId}): ${error.message}`);
    return null;
  }
}
