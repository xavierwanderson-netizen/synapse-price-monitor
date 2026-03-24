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
        console.error(`❌ ${label}: Falha permanente após ${maxRetries} tentativas`);
        throw error;
      }

      // Calcular delay com backoff exponencial
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

      // Detectar se é erro temporário ou permanente
      const status = error.response?.status;
      const isTemporary =
        !status || // Network error
        status === 429 || // Rate limit
        status === 503 || // Service unavailable
        status === 504 || // Gateway timeout
        status === 408; // Request timeout

      if (!isTemporary && status !== 403) {
        // 403 pode ser IP bloqueado (temporário)
        console.error(`❌ ${label}: Erro permanente (${status}): ${error.message}`);
        throw error;
      }

      console.warn(
        `⚠️ ${label}: Tentativa ${attempt}/${maxRetries} falhou - Retry em ${delay}ms (${error.message})`
      );

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Detecta se a resposta é uma página de bloqueio ou erro
 */
export function isBlockedOrErrorPage(html) {
  if (!html || html.length < 100) return true;

  const indicators = [
    "robot check",
    "captcha",
    "suspicious activity",
    "access denied",
    "blocked",
    "403",
    "503",
    '<title>Error</title>',
    "please try again later"
  ];

  return indicators.some((indicator) =>
    html.toLowerCase().includes(indicator)
  );
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
