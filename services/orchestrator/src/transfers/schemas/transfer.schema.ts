import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { TransferStatus } from '../common/interfaces';

export type TransferDocument = Transfer & Document;

@Schema({ timestamps: true })
export class Transfer {
    @Prop({ required: true, unique: true, index: true })
    transferId!: string;

    @Prop(
        raw({
            senderId: { type: String, required: true },
            name: { type: String, required: true },
        }),
    )
    sender!: { senderId: string; name: string };

    @Prop(
        raw({
            name: { type: String, required: true },
            country: { type: String, required: true },
            payoutMethod: { type: String, required: true },
            payoutDetails: { type: Object, default: {} },
        }),
    )
    recipient!: {
        name: string;
        country: string;
        payoutMethod: string;
        payoutDetails: Record<string, string>;
    };

    @Prop({ required: true, min: 0.01 })
    sendAmount!: number;

    @Prop({ required: true })
    sendCurrency!: string;

    @Prop({ required: true })
    payoutCurrency!: string;

    @Prop({
        required: true,
        enum: Object.values(TransferStatus),
        default: TransferStatus.CREATED,
    })
    status!: string;

    @Prop({
        type: [
            {
                state: { type: String, enum: Object.values(TransferStatus) },
                timestamp: { type: Date, default: Date.now },
                metadata: { type: String },
            },
        ],
        default: [],
    })
    stateHistory!: Array<{
        state: TransferStatus;
        timestamp: Date;
        metadata?: string;
    }>;

    @Prop(
        raw({
            quoteId: String,
            rate: Number,
            fee: Number,
            payoutAmount: Number,
            sendAmount: Number,
            sendCurrency: String,
            payoutCurrency: String,
            expiresAt: Date,
        }),
    )
    quote?: {
        quoteId: string;
        rate: number;
        fee: number;
        payoutAmount: number;
        sendAmount: number;
        sendCurrency: string;
        payoutCurrency: string;
        expiresAt: Date;
    };

    @Prop(
        raw({
            quoteId: String,
            rate: Number,
            fee: Number,
            payoutAmount: Number,
            sendAmount: Number,
            sendCurrency: String,
            payoutCurrency: String,
            expiresAt: Date,
        }),
    )
    confirmedQuoteSnapshot?: {
        quoteId: string;
        rate: number;
        fee: number;
        payoutAmount: number;
        sendAmount: number;
        sendCurrency: string;
        payoutCurrency: string;
        expiresAt: Date;
    };

    @Prop(
        raw({
            paidAmount: { type: Number },
            refundedAmount: { type: Number },
            feesCharged: { type: Number },
        }),
    )
    final?: {
        paidAmount?: number;
        refundedAmount?: number;
        feesCharged?: number;
    };

    @Prop(
        raw({
            decision: { type: String, enum: ['APPROVED', 'REJECTED', 'PENDING'] },
            triggeredRules: [String],
            timestamp: Date,
            reviewerId: String,
        }),
    )
    complianceDecision?: {
        decision: 'APPROVED' | 'REJECTED' | 'PENDING';
        triggeredRules: string[];
        timestamp: Date;
        reviewerId?: string;
    };

    @Prop()
    partnerPayoutId?: string;

    @Prop({ default: 0 })
    version!: number;
}

export const TransferSchema = SchemaFactory.createForClass(Transfer);

// Indexes
TransferSchema.index({ 'sender.senderId': 1 });
TransferSchema.index({ partnerPayoutId: 1 });
