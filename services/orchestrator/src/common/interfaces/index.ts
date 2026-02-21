export enum TransferStatus {
    CREATED = 'CREATED',
    QUOTED = 'QUOTED',
    CONFIRMED = 'CONFIRMED',
    COMPLIANCE_PENDING = 'COMPLIANCE_PENDING',
    COMPLIANCE_APPROVED = 'COMPLIANCE_APPROVED',
    COMPLIANCE_REJECTED = 'COMPLIANCE_REJECTED',
    PAYOUT_PENDING = 'PAYOUT_PENDING',
    PAID = 'PAID',
    FAILED = 'FAILED',
    REFUNDED = 'REFUNDED',
    CANCELLED = 'CANCELLED',
}

export interface ISender {
    senderId: string;
    name: string;
}

export interface IRecipient {
    name: string;
    country: string;
    payoutMethod: string;
    payoutDetails: Record<string, string>;
}

export interface IQuote {
    quoteId: string;
    rate: number;
    fee: number;
    payoutAmount: number;
    sendAmount: number;
    sendCurrency: string;
    payoutCurrency: string;
    expiresAt: Date;
}

export interface IStateHistoryEntry {
    state: TransferStatus;
    timestamp: Date;
    metadata?: string;
}

export interface IComplianceDecision {
    decision: 'APPROVED' | 'REJECTED' | 'PENDING';
    triggeredRules: string[];
    timestamp: Date;
    reviewerId?: string;
}

export interface IFinancialSummary {
    paidAmount?: number;
    refundedAmount?: number;
    feesCharged?: number;
}

export interface ITransfer {
    transferId: string;
    sender: ISender;
    recipient: IRecipient;
    sendAmount: number;
    sendCurrency: string;
    payoutCurrency: string;
    status: TransferStatus;
    stateHistory: IStateHistoryEntry[];
    quote?: IQuote;
    confirmedQuoteSnapshot?: IQuote;
    financialSummary?: IFinancialSummary;
    complianceDecision?: IComplianceDecision;
    partnerPayoutId?: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
