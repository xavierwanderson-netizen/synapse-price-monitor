import axios from "axios";
import crypto from "crypto";

// Função auxiliar para gerar a assinatura (evita repetição de código)
function generateSignature(appId, appKey, timestamp) {
  const baseStr = `${appId}${timestamp}${appKey}`;
  return crypto.createHash("sha256").update(baseStr).digest("hex");
}

/**
 * MELHORIA: Gera link curto de afiliado (shope.ee)
 * Baseado na mutation generateShortLink da documentação v2
 */
export async function generateShopeeShortLink(originUrl) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature(appId, appKey, timestamp);

    const query = `mutation {
      generateShortLink(input: { originUrl: "${originUrl}" }) {
        shortLink
      }
    }`;

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
    console.error("⚠️ Falha ao encurtar link Shopee:", error.message);
    return originUrl; // Retorna o link original se o encurtador falhar
  }
}

/**
 * FUNÇÃO ORIGINAL (Mantida intacta para evitar erros anteriores)
 */
export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

    if (!appId || !appKey) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature(appId, appKey, timestamp);

    const payload = {
      query: `query{productOfferV2(itemId:${itemId},shopId:${shopId}){nodes{productName,priceMin,productLink,imageUrl}}}`
    };

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      payload,
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    if (data.errors) {
      console.error(`⚠️ Shopee API Error (${itemId}): ${data.errors[0].message}`);
      return null;
    }

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (!node || !node.priceMin) return null;

    // NOVIDADE: Tenta encurtar o link antes de retornar
    const shortLink = await generateShopeeShortLink(node.productLink);

    return {
      id: `shopee_${itemId}`,
      title: node.productName,
      price: parseFloat(node.priceMin),
      url: shortLink, // Agora retorna o link shope.ee
      image: node.imageUrl || null,
      platform: "shopee"
    };
  } catch (error) {
    console.error(`❌ Erro Shopee (${itemId}): ${error.message}`);
    return null;
  }
}
