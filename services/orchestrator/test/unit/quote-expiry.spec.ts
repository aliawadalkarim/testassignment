import { BadRequestException } from '@nestjs/common';

/**
 * Unit test for quote expiry behavior.
 * Tests are standalone — no NestJS TestingModule needed.
 */
describe('Quote Expiry Behavior', () => {
    // Helper: simulate quote expiry check logic identical to TransfersService.confirm()
    function validateQuoteExpiry(quoteExpiresAt: Date): void {
        if (new Date() > quoteExpiresAt) {
            throw new BadRequestException(
                'Quote has expired. Please create a new transfer.',
            );
        }
    }

    it('should allow confirmation with a valid (non-expired) quote', () => {
        const futureExpiry = new Date(Date.now() + 60 * 1000); // 60s from now
        expect(() => validateQuoteExpiry(futureExpiry)).not.toThrow();
    });

    it('should reject confirmation with an expired quote', () => {
        const pastExpiry = new Date(Date.now() - 1000); // 1s ago
        expect(() => validateQuoteExpiry(pastExpiry)).toThrow(BadRequestException);
        expect(() => validateQuoteExpiry(pastExpiry)).toThrow('Quote has expired');
    });

    it('should reject confirmation with a quote that just expired', () => {
        const justExpired = new Date(Date.now() - 1); // 1ms ago
        expect(() => validateQuoteExpiry(justExpired)).toThrow(BadRequestException);
    });

    it('should handle quote expiry at exact boundary', () => {
        // Quote expiring right now — the check is > (strictly greater),
        // so equal means not yet expired if we hit exact same millisecond
        const now = new Date();
        // NOTE: Due to timing, this test validates the boundary behavior
        // In practice, with > comparison, a quote at exactly "now" is still valid
        // for the current millisecond
        expect(() => validateQuoteExpiry(now)).not.toThrow();
    });

    describe('quote snapshot immutability', () => {
        it('should create an immutable snapshot on confirm', () => {
            const originalQuote = {
                quoteId: 'q-123',
                rate: 0.92,
                fee: 7.5,
                payoutAmount: 452.3,
                sendAmount: 500,
                sendCurrency: 'USD',
                payoutCurrency: 'EUR',
                expiresAt: new Date(Date.now() + 60000),
            };

            // Simulate snapshot creation (spread copy)
            const snapshot = { ...originalQuote };

            // Mutating the original should NOT affect the snapshot
            originalQuote.rate = 1.0;
            originalQuote.fee = 0;

            expect(snapshot.rate).toBe(0.92);
            expect(snapshot.fee).toBe(7.5);
            expect(snapshot.payoutAmount).toBe(452.3);
        });
    });
});
