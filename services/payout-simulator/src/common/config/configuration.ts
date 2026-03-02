export default () => ({
    port: parseInt(process.env.PAYOUT_SERVICE_PORT || '3002', 10),
    orchestratorWebhookUrl:
        process.env.ORCHESTRATOR_WEBHOOK_URL ||
        'http://orchestrator:3000/webhooks/payout-status',
    // NOTE: This default MUST match the orchestrator's default in configuration.ts
    webhookSecret:
        process.env.WEBHOOK_SECRET || 'super-secret-webhook-key-change-me',
});
