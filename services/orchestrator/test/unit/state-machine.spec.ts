import { StateMachineService } from '../../src/state-machine/state-machine.service';
import { TransferStatus } from '../../src/common/interfaces';
import { BadRequestException } from '@nestjs/common';

describe('StateMachineService', () => {
    let service: StateMachineService;

    beforeEach(() => {
        service = new StateMachineService();
    });

    describe('valid transitions', () => {
        const validTransitions: [TransferStatus, TransferStatus][] = [
            [TransferStatus.CREATED, TransferStatus.QUOTED],
            [TransferStatus.CREATED, TransferStatus.CANCELLED],
            [TransferStatus.QUOTED, TransferStatus.CONFIRMED],
            [TransferStatus.QUOTED, TransferStatus.CANCELLED],
            [TransferStatus.CONFIRMED, TransferStatus.COMPLIANCE_PENDING],
            [TransferStatus.CONFIRMED, TransferStatus.COMPLIANCE_APPROVED],
            [TransferStatus.CONFIRMED, TransferStatus.COMPLIANCE_REJECTED],
            [TransferStatus.COMPLIANCE_PENDING, TransferStatus.COMPLIANCE_APPROVED],
            [TransferStatus.COMPLIANCE_PENDING, TransferStatus.COMPLIANCE_REJECTED],
            [TransferStatus.COMPLIANCE_APPROVED, TransferStatus.PAYOUT_PENDING],
            [TransferStatus.PAYOUT_PENDING, TransferStatus.PAID],
            [TransferStatus.PAYOUT_PENDING, TransferStatus.FAILED],
            [TransferStatus.FAILED, TransferStatus.REFUNDED],
        ];

        test.each(validTransitions)(
            '%s → %s should be valid',
            (from, to) => {
                expect(() => service.validateTransition(from, to)).not.toThrow();
            },
        );
    });

    describe('invalid transitions', () => {
        const invalidTransitions: [TransferStatus, TransferStatus][] = [
            [TransferStatus.CREATED, TransferStatus.PAID],
            [TransferStatus.CREATED, TransferStatus.CONFIRMED],
            [TransferStatus.CREATED, TransferStatus.PAYOUT_PENDING],
            [TransferStatus.QUOTED, TransferStatus.PAID],
            [TransferStatus.QUOTED, TransferStatus.PAYOUT_PENDING],
            [TransferStatus.CONFIRMED, TransferStatus.PAID],
            [TransferStatus.CONFIRMED, TransferStatus.PAYOUT_PENDING],
            [TransferStatus.COMPLIANCE_APPROVED, TransferStatus.PAID],
            [TransferStatus.PAYOUT_PENDING, TransferStatus.REFUNDED],
            [TransferStatus.PAID, TransferStatus.REFUNDED],
            [TransferStatus.PAID, TransferStatus.FAILED],
            [TransferStatus.REFUNDED, TransferStatus.PAID],
            [TransferStatus.CANCELLED, TransferStatus.CONFIRMED],
            [TransferStatus.COMPLIANCE_REJECTED, TransferStatus.PAYOUT_PENDING],
        ];

        test.each(invalidTransitions)(
            '%s → %s should throw BadRequestException',
            (from, to) => {
                expect(() => service.validateTransition(from, to)).toThrow(
                    BadRequestException,
                );
            },
        );
    });

    describe('terminal states', () => {
        const terminalStates = [
            TransferStatus.PAID,
            TransferStatus.REFUNDED,
            TransferStatus.CANCELLED,
            TransferStatus.COMPLIANCE_REJECTED,
        ];

        test.each(terminalStates)('%s should be terminal', (state) => {
            expect(service.isTerminalState(state)).toBe(true);
        });

        const nonTerminalStates = [
            TransferStatus.CREATED,
            TransferStatus.QUOTED,
            TransferStatus.CONFIRMED,
            TransferStatus.COMPLIANCE_PENDING,
            TransferStatus.COMPLIANCE_APPROVED,
            TransferStatus.PAYOUT_PENDING,
            TransferStatus.FAILED,
        ];

        test.each(nonTerminalStates)('%s should NOT be terminal', (state) => {
            expect(service.isTerminalState(state)).toBe(false);
        });
    });

    describe('getAllowedTransitions', () => {
        it('should return valid next states for CREATED', () => {
            const allowed = service.getAllowedTransitions(TransferStatus.CREATED);
            expect(allowed).toEqual(
                expect.arrayContaining([TransferStatus.QUOTED, TransferStatus.CANCELLED]),
            );
        });

        it('should return empty array for terminal states', () => {
            expect(service.getAllowedTransitions(TransferStatus.PAID)).toEqual([]);
            expect(service.getAllowedTransitions(TransferStatus.REFUNDED)).toEqual([]);
        });
    });
});
