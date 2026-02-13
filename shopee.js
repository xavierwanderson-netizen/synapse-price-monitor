import axios from "axios";
import crypto from "crypto";

export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();

    if (!appId || !appKey) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    
    // A Shopee exige: appId + timestamp + appKey (sem espaços)
    const baseStr = `${appId}${timestamp}${appKey}`;
    const signature = crypto
      .createHash("sha256")
      .update(baseStr)
      .digest("hex");

    // Construção do payload sem espaços internos para evitar divergência na assinatura
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

    // Tratamento de erro interno do GraphQL
    if (data.errors) {
      console.error(`⚠️ Shopee API Error (${itemId}): ${data.errors[0].message}`);
      return null;
    }

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (!node || !node.priceMin) return null;

    return {
      id: `shopee_${itemId}`,
      title: node.productName,
      price: parseFloat(node.priceMin),
      url: node.productLink,
      image: node.imageUrl || null,
      platform: "shopee"
    };
  } catch (error) {
    console.error(`❌ Erro Shopee (${itemId}): ${error.message}`);
    return null;
  }
}
