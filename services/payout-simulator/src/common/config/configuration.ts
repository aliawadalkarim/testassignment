export default () => ({
    port: parseInt(process.env.PAYOUT_SERVICE_PORT || '3002', 10),
    orchestratorWebhookUrl:
        process.env.ORCHESTRATOR_WEBHOOK_URL ||
        'http://orchestrator:3000/webhooks/payout-status',
    webhookSecret:
        process.env.WEBHOOK_SECRET || 'super-secret-webhook-key-change-me',

    /** Webhook delivery settings */
    webhook: {
        maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
        /** Simulated delay range in ms [min, max] */
        delayMinMs: parseInt(process.env.WEBHOOK_DELAY_MIN_MS || '2000', 10),
        delayMaxMs: parseInt(process.env.WEBHOOK_DELAY_MAX_MS || '5000', 10),
        /** Probability of success (0-1) */
        successRate: parseFloat(process.env.WEBHOOK_SUCCESS_RATE || '0.8'),
    },
});
