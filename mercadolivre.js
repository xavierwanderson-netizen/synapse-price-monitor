export async function fetchMLProduct(mlId) {
  try {
    let tokens = { access_token: null };
    if (fs.existsSync(TOKEN_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    if (!tokens.access_token) tokens = await getInitialToken();

    // Mudança crucial: Adicionamos o Token, mas chamamos o recurso de forma que o ML entenda que é uma consulta de Afiliado
    const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
      headers: { 
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    const item = response.data;
    // Se o preço vier zerado ou escondido, tentaremos extrair da estrutura de 'price'
    const currentPrice = item.price || (item.prices && item.prices.prices[0].amount);

    if (item && currentPrice) {
      return {
        id: mlId,
        title: item.title,
        price: currentPrice,
        url: `${item.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
        platform: 'mercadolivre'
      };
    }
    return null;
  } catch (error) {
    // Se der 403 aqui, vamos tentar a chamada sem o Bearer Token como 'fallback' (plano B)
    if (error.response?.status === 403) {
      try {
        const publicRes = await axios.get(`https://api.mercadolibre.com/items/${mlId}`);
        return {
          id: mlId,
          title: publicRes.data.title,
          price: publicRes.data.price,
          url: `${publicRes.data.permalink}?matt_tool=${process.env.ML_AFFILIATE_ID}`,
          platform: 'mercadolivre'
        };
      } catch (e) {
        console.error(`❌ Erro ML Proibido (${mlId}): Tente validar seus dados de vendedor no painel.`);
      }
    }
    return null;
  }
}
