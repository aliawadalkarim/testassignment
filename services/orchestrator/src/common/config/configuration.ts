export default () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/remittance',
    fxServiceUrl: process.env.FX_SERVICE_URL || 'http://localhost:3001',
    payoutServiceUrl: process.env.PAYOUT_SERVICE_URL || 'http://localhost:3002',
    webhookSecret: process.env.WEBHOOK_SECRET || 'super-secret-webhook-key-change-me',

    /** HTTP timeout for inter-service calls (ms) */
    httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS || '5000', 10),

    /** Compliance settings */
    compliance: {
        blockedCountries: (process.env.BLOCKED_COUNTRIES || 'KP,IR,SY,CU').split(','),
        sanctionedNames: (process.env.SANCTIONED_NAMES || 'JOHN DOE SANCTIONED,JANE TERRORIST,BLOCKED PERSON,SANCTIONED INDIVIDUAL').split(','),
        manualReviewThreshold: parseFloat(process.env.MANUAL_REVIEW_THRESHOLD || '10000'),
    },
});
