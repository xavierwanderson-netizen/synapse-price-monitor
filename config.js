/**
 * config.js - Validação centralizada de todas as variáveis do Railway
 * Executa no startup e falha rápido se algo estiver faltando
 */

export function validateEnvironment() {
  console.log("\n📋 VALIDANDO CONFIGURAÇÃO DO RAILWAY...\n");

  const required = {
    // Timing
    CHECK_INTERVAL_MINUTES: process.env.CHECK_INTERVAL_MINUTES || "90",
    REQUEST_DELAY_MS: process.env.REQUEST_DELAY_MS || "8000",
    ALERT_COOLDOWN_HOURS: process.env.ALERT_COOLDOWN_HOURS || "24",

    // Amazon
    AMAZON_MARKETPLACE: process.env.AMAZON_MARKETPLACE || "www.amazon.com.br",
    AMAZON_PARTNER_TAG: process.env.AMAZON_PARTNER_TAG || null,
    AMAZON_CREDENTIAL_ID: process.env.AMAZON_CREDENTIAL_ID || null,
    AMAZON_CREDENTIAL_SECRET: process.env.AMAZON_CREDENTIAL_SECRET || null,
    AMAZON_TIMEOUT_MS: process.env.AMAZON_TIMEOUT_MS || "30000",
    AMAZON_MAX_RETRIES: process.env.AMAZON_MAX_RETRIES || "3",
    AMAZON_BACKOFF_BASE_MS: process.env.AMAZON_BACKOFF_BASE_MS || "3000",

    // Mercado Livre
    ML_CLIENT_ID: process.env.ML_CLIENT_ID || null,
    ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET || null,
    ML_INITIAL_CODE: process.env.ML_INITIAL_CODE || null,
    ML_REDIRECT_URI: process.env.ML_REDIRECT_URI || null,

    // Shopee
    SHOPEE_APP_ID: process.env.SHOPEE_APP_ID || null,
    SHOPEE_APP_KEY: process.env.SHOPEE_APP_KEY || null,

    // Telegram
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,

    // WhatsApp (opcional)
    WA_GROUP_ID: process.env.WA_GROUP_ID || null,

    // Proxy (opcional)
    PROXY_URL: process.env.PROXY_URL || null,

    // Volume
    RAILWAY_VOLUME_MOUNT_PATH: process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data",
  };

  const missing = [];
  const configured = [];

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
      console.log(`❌ ${key}: NÃO CONFIGURADO`);
    } else if (value.length > 20) {
      // Oculta valores longos por segurança
      configured.push(key);
      console.log(`✅ ${key}: ****${value.slice(-4)}`);
    } else {
      configured.push(key);
      console.log(`✅ ${key}: ${value}`);
    }
  }

  console.log(`\n📊 Resumo: ${configured.length} configuradas, ${missing.length} faltando\n`);

  // Variáveis críticas que causam falha
  const critical = [
    "AMAZON_PARTNER_TAG",
    "AMAZON_CREDENTIAL_ID",
    "AMAZON_CREDENTIAL_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ];

  const missingCritical = missing.filter(m => critical.includes(m));

  if (missingCritical.length > 0) {
    console.error(`\n🚨 ERRO CRÍTICO: Variáveis obrigatórias faltando:`);
    missingCritical.forEach(v => console.error(`   - ${v}`));
    console.error(`\nConfigure estas variáveis no Railway e faça redeploy.\n`);
    throw new Error(`Configuração incompleta: ${missingCritical.join(", ")}`);
  }

  console.log("✅ TODAS AS VARIÁVEIS CRÍTICAS CONFIGURADAS\n");

  return {
    timing: {
      checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || "90", 10),
      requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || "8000", 10),
      alertCooldownHours: parseInt(process.env.ALERT_COOLDOWN_HOURS || "24", 10),
    },
    amazon: {
      enabled: !!(process.env.AMAZON_PARTNER_TAG && process.env.AMAZON_CREDENTIAL_ID),
      marketplace: process.env.AMAZON_MARKETPLACE || "www.amazon.com.br",
      partnerTag: process.env.AMAZON_PARTNER_TAG,
      timeoutMs: parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10),
      maxRetries: parseInt(process.env.AMAZON_MAX_RETRIES || "3", 10),
      backoffBaseMs: parseInt(process.env.AMAZON_BACKOFF_BASE_MS || "3000", 10),
    },
    mercadolivre: {
      enabled: !!(process.env.ML_CLIENT_ID && process.env.ML_INITIAL_CODE),
      clientId: process.env.ML_CLIENT_ID,
    },
    shopee: {
      enabled: !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_KEY),
      appId: process.env.SHOPEE_APP_ID,
    },
    telegram: {
      enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    },
    whatsapp: {
      enabled: !!process.env.WA_GROUP_ID,
      groupId: process.env.WA_GROUP_ID,
    },
    dataDir: process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data",
    proxyUrl: process.env.PROXY_URL || null,
  };
}

export default validateEnvironment;
