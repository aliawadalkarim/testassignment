import { ComplianceService } from '../../src/compliance/compliance.service';
import { TransferStatus } from '../../src/common/interfaces';

describe('ComplianceService', () => {
    let service: ComplianceService;

    beforeEach(() => {
        service = new ComplianceService();
    });

    describe('country blocklist', () => {
        const blockedCountries = ['KP', 'IR', 'SY', 'CU'];

        test.each(blockedCountries)(
            'should REJECT transfers to blocked country %s',
            (country) => {
                const result = service.screen(country, 'John Smith', 'Jane Doe', 500, 'test-id');
                expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
                expect(result.decision.decision).toBe('REJECTED');
                expect(result.decision.triggeredRules[0]).toContain('BLOCKED_COUNTRY');
            },
        );

        it('should be case-insensitive for country codes', () => {
            const result = service.screen('kp', 'John Smith', 'Jane Doe', 500, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
        });
    });

    describe('name screening', () => {
        it('should REJECT when recipient name matches sanctions list', () => {
            const result = service.screen('US', 'John Doe Sanctioned', 'Jane Doe', 500, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
            expect(result.decision.decision).toBe('REJECTED');
            expect(result.decision.triggeredRules[0]).toContain('SANCTIONED_NAME');
        });

        it('should REJECT when sender name matches sanctions list', () => {
            const result = service.screen('US', 'Normal Person', 'Blocked Person', 500, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
            expect(result.decision.triggeredRules[0]).toContain('SANCTIONED_NAME');
        });

        it('should be case-insensitive for name matching', () => {
            const result = service.screen('US', 'john doe sanctioned', 'Jane', 500, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
        });
    });

    describe('amount threshold', () => {
        it('should require MANUAL REVIEW for amounts above $10,000', () => {
            const result = service.screen('US', 'John Smith', 'Jane Doe', 15000, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_PENDING);
            expect(result.decision.decision).toBe('PENDING');
            expect(result.decision.triggeredRules[0]).toContain('AMOUNT_THRESHOLD');
        });

        it('should APPROVE amounts at exactly $10,000', () => {
            const result = service.screen('US', 'John Smith', 'Jane Doe', 10000, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_APPROVED);
        });

        it('should require MANUAL REVIEW for amounts just above $10,000', () => {
            const result = service.screen('US', 'John Smith', 'Jane Doe', 10001, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_PENDING);
        });
    });

    describe('clean transfers', () => {
        it('should APPROVE normal transfers', () => {
            const result = service.screen('US', 'John Smith', 'Jane Doe', 500, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_APPROVED);
            expect(result.decision.decision).toBe('APPROVED');
        });

        it('should include timestamp in decision', () => {
            const result = service.screen('US', 'John Smith', 'Jane Doe', 500, 'test-id');
            expect(result.decision.timestamp).toBeInstanceOf(Date);
        });
    });

    describe('rule priority', () => {
        it('should reject by country before checking amount', () => {
            // Even though amount > threshold, country blocklist takes priority
            const result = service.screen('KP', 'John Smith', 'Jane Doe', 15000, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
            expect(result.decision.triggeredRules[0]).toContain('BLOCKED_COUNTRY');
        });

        it('should reject by name before checking amount', () => {
            const result = service.screen('US', 'John Doe Sanctioned', 'Jane Doe', 15000, 'test-id');
            expect(result.status).toBe(TransferStatus.COMPLIANCE_REJECTED);
            expect(result.decision.triggeredRules[0]).toContain('SANCTIONED_NAME');
        });
    });
});
