import { Injectable, BadRequestException } from '@nestjs/common';
import { TransferStatus } from '../common/interfaces';

// Define valid state transitions
const VALID_TRANSITIONS: Record<string, TransferStatus[]> = {
    [TransferStatus.CREATED]: [TransferStatus.QUOTED, TransferStatus.CANCELLED],
    [TransferStatus.QUOTED]: [TransferStatus.CONFIRMED, TransferStatus.CANCELLED],
    [TransferStatus.CONFIRMED]: [
        TransferStatus.COMPLIANCE_PENDING,
        TransferStatus.COMPLIANCE_APPROVED,
        TransferStatus.COMPLIANCE_REJECTED,
    ],
    [TransferStatus.COMPLIANCE_PENDING]: [
        TransferStatus.COMPLIANCE_APPROVED,
        TransferStatus.COMPLIANCE_REJECTED,
    ],
    [TransferStatus.COMPLIANCE_APPROVED]: [TransferStatus.PAYOUT_PENDING],
    [TransferStatus.PAYOUT_PENDING]: [TransferStatus.PAID, TransferStatus.FAILED],
    [TransferStatus.FAILED]: [TransferStatus.REFUNDED],
    // Terminal states — no further transitions
    [TransferStatus.PAID]: [],
    [TransferStatus.REFUNDED]: [],
    [TransferStatus.CANCELLED]: [],
    [TransferStatus.COMPLIANCE_REJECTED]: [],
};

@Injectable()
export class StateMachineService {
    /**
     * Validates whether a transition from currentState to newState is allowed.
     * Throws BadRequestException if not.
     */
    validateTransition(
        currentState: TransferStatus,
        newState: TransferStatus,
    ): void {
        const allowedTransitions = VALID_TRANSITIONS[currentState];

        if (!allowedTransitions) {
            throw new BadRequestException(
                `Unknown current state: ${currentState}`,
            );
        }

        if (!allowedTransitions.includes(newState)) {
            throw new BadRequestException(
                `Invalid state transition: ${currentState} → ${newState}. ` +
                `Allowed transitions from ${currentState}: [${allowedTransitions.join(', ')}]`,
            );
        }
    }

    /**
     * Returns the list of valid next states from the current state.
     */
    getAllowedTransitions(currentState: TransferStatus): TransferStatus[] {
        return VALID_TRANSITIONS[currentState] || [];
    }

    /**
     * Checks if the transfer is in a terminal state.
     */
    isTerminalState(state: TransferStatus): boolean {
        const allowed = VALID_TRANSITIONS[state];
        return allowed !== undefined && allowed.length === 0;
    }
}
