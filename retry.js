/**
 * retry.js - Utilidade de Retry com Backoff Exponencial
 * Reutilizável por todos os scrapers para tratamento consistente de falhas
 */
export async function retryWithBackoff(
  fn,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 30000,
  label = "Operation"
) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        // ✅ Falha permanente após esgotar tentativas: isso sim é erro real
        console.error(`❌ ${label}: Falha permanente após ${maxRetries} tentativas`);
        throw error;
      }

      const status = error.response?.status;

      // 404 — produto não encontrado, não adianta tentar de novo
      if (status === 404) {
        console.warn(`⚠️ ${label}: HTTP 404 — produto não encontrado, abortando retries`);
        throw error;
      }

      // 403 — IP bloqueado; pode ser temporário, mas não vale esgotar retries rápido
      if (status === 403) {
        console.warn(`⚠️ ${label}: HTTP 403 — IP possivelmente bloqueado (tentativa ${attempt}/${maxRetries})`);
      }

      // Classificar se o erro é temporário (vale retry) ou permanente
      const isTemporary =
        !status ||   // Erro de rede (ECONNREFUSED, ENOTFOUND, timeout)
        status === 403 || // IP bloqueado — temporário com proxy
        status === 429 || // Rate limit
        status === 503 || // Service unavailable
        status === 504 || // Gateway timeout
        status === 408;   // Request timeout

      if (!isTemporary) {
        console.error(`❌ ${label}: Erro permanente (HTTP ${status}): ${error.message}`);
        throw error;
      }

      // Backoff exponencial com ±25% de jitter para evitar thundering herd
      const expDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = expDelay * 0.25;
      const delay = Math.floor(expDelay + (Math.random() * jitter * 2) - jitter);

      const errorType = !status ? "erro de rede" : `HTTP ${status}`;
      // ✅ FIX: retry é comportamento esperado, não erro
      console.log(
        `⚠️ ${label}: Tentativa ${attempt}/${maxRetries} falhou [${errorType}] — retry em ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Detecta se a resposta é uma página de bloqueio ou erro.
 * Retorna uma string descrevendo o motivo quando bloqueada, ou null quando OK.
 * Usa indicadores específicos para evitar falsos positivos em páginas normais da Amazon.
 */
export function isBlockedOrErrorPage(html) {
  if (!html || html.length < 500) return "resposta vazia ou muito curta";

  const lower = html.toLowerCase();

  // Hard indicators — unambiguous blocking signals
  const hardIndicators = [
    { pattern: "robot check",            label: "robot check" },
    { pattern: "captcha",                label: "captcha" },
    { pattern: "suspicious activity",    label: "suspicious activity" },
    { pattern: "enter the characters you see below", label: "captcha challenge" },
    { pattern: "type the characters you see in this image", label: "captcha image" },
    { pattern: "api-services-support@amazon.com", label: "api block page" },
  ];

  for (const { pattern, label } of hardIndicators) {
    if (lower.includes(pattern)) {
      console.warn(`🚫 [isBlockedOrErrorPage] Indicador de bloqueio encontrado: "${label}"`);
      return label;
    }
  }

  // HTTP 403 / 503 error pages — only when there is NO product content at all
  const hasProductContent =
    lower.includes("productTitle") ||
    lower.includes("a-price") ||
    lower.includes("add-to-cart") ||
    lower.includes("buybox") ||
    lower.includes("dp/product");

  if (!hasProductContent) {
    if (lower.includes("access denied") || lower.includes("403 forbidden")) {
      console.warn(`🚫 [isBlockedOrErrorPage] Página de erro 403/acesso negado sem conteúdo de produto`);
      return "access denied (sem conteúdo de produto)";
    }
    if (lower.includes("service unavailable") || lower.includes("503")) {
      console.warn(`🚫 [isBlockedOrErrorPage] Página 503 sem conteúdo de produto`);
      return "service unavailable (sem conteúdo de produto)";
    }
    if (lower.includes("<title>error</title>") || lower.includes("<title>page not found</title>")) {
      console.warn(`🚫 [isBlockedOrErrorPage] Página de erro genérica sem conteúdo de produto`);
      return "página de erro genérica";
    }
  }

  return null;
}

/**
 * Lista de User-Agents para rotação
 */
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0"
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
