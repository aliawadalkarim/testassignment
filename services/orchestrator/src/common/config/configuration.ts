export default () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/remittance',
    fxServiceUrl: process.env.FX_SERVICE_URL || 'http://localhost:3001',
    payoutServiceUrl: process.env.PAYOUT_SERVICE_URL || 'http://localhost:3002',
    webhookSecret: process.env.WEBHOOK_SECRET || 'super-secret-webhook-key-change-me',
});
