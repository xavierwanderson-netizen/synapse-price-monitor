import axios from "axios";
import crypto from "crypto";
import { retryWithBackoff } from "./retry.js";

/**
 * MELHORIA: Encurtador de Links (shope.ee) com Fallback
 */
async function generateShopeeShortLink(originUrl) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

    if (!appId || !appKey) return originUrl;

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
        },
        timeout: 5000
      }
    );

    return data?.data?.generateShortLink?.shortLink || originUrl;
  } catch (error) {
    console.warn(`⚠️ Shopee Short Link falhou: ${error.message}. Usando URL original.`);
    return originUrl;
  }
}

/**
 * FUNÇÃO PRINCIPAL: Captura de Preço com Retry
 */
export async function fetchShopeeProduct(itemId, shopId) {
  const appId = String(process.env.SHOPEE_APP_ID || "").trim();
  const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

  if (!appId || !appKey) {
    console.warn("⚠️ Shopee: APP_ID ou APP_KEY não configurados");
    return null;
  }

  try {
    return await retryWithBackoff(
      async () => {
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
            timeout: 20000
          }
        );

        // Tratamento de erros GraphQL
        if (data.errors) {
          const err = data.errors[0];
          console.error(`⚠️ Shopee API Error [${err.extensions?.code}]: ${err.message}`);
          throw new Error(`GraphQL Error: ${err.message}`);
        }

        const node = data?.data?.productOfferV2?.nodes?.[0];
        if (!node || !node.priceMin) {
          throw new Error("Nó de produto vazio ou sem priceMin");
        }

        // Converte para link curto antes de retornar
        // Nota: Se short link falhar, originUrl é retornado automaticamente
        const finalUrl = await generateShopeeShortLink(node.productLink);

        return {
          id: `shopee_${itemId}`,
          title: node.productName,
          price: parseFloat(node.priceMin),
          url: finalUrl,
          image: node.imageUrl || null,
          platform: "shopee"
        };
      },
      3,
      2000,
      20000,
      `Shopee API (${itemId})`
    );
  } catch (error) {
    console.error(`❌ Erro Shopee (${itemId}):`, error.message);
    return null;
  }
}
