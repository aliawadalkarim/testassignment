export default () => ({
    port: parseInt(process.env.FX_SERVICE_PORT || '3001', 10),

    /** FX rate API */
    fxApi: {
        baseUrl: process.env.FX_API_BASE_URL || 'https://open.er-api.com/v6/latest',
        timeoutMs: parseInt(process.env.FX_API_TIMEOUT_MS || '5000', 10),
    },

    /** Rate cache TTL */
    cacheTtlMs: parseInt(process.env.FX_CACHE_TTL_MS || '300000', 10), // 5 minutes

    /** Currencies to pre-warm on startup */
    preWarmCurrencies: (process.env.FX_PRE_WARM_CURRENCIES || 'AED,USD,EUR,GBP').split(','),

    /** Quote settings */
    quote: {
        /** ± spread range applied to mid-market rate (0.02 = ±2%) */
        spreadPercent: parseFloat(process.env.FX_SPREAD_PERCENT || '0.02'),
        /** Flat fee component */
        flatFee: parseFloat(process.env.FX_FLAT_FEE || '5'),
        /** Percentage fee component (0.005 = 0.5%) */
        percentFee: parseFloat(process.env.FX_PERCENT_FEE || '0.005'),
        /** Quote expiry in milliseconds */
        expiryMs: parseInt(process.env.FX_QUOTE_EXPIRY_MS || '300000', 10), // 5 minutes
    },
});
