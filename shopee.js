export async function generateShopeeShortLink(originUrl) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID || "").trim();
    const appKey = String(process.env.SHOPEE_APP_KEY || "").trim();
    const timestamp = Math.floor(Date.now() / 1000);

    // subIds para rastreio no Conversion Report
    const query = `mutation{generateShortLink(input:{originUrl:"${originUrl}",subIds:["telegram","monitor_precos"]}){shortLink}}`;
    const payload = JSON.stringify({ query });

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
