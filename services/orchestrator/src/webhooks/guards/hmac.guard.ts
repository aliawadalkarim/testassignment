import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class HmacGuard implements CanActivate {
    private readonly logger = new Logger(HmacGuard.name);
    private readonly webhookSecret: string;

    constructor(private readonly configService: ConfigService) {
        this.webhookSecret = this.configService.get<string>('webhookSecret', 'super-secret-webhook-key-change-me');
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const signature = request.headers['x-webhook-signature'] as string;

        if (!signature) {
            this.logger.warn('Webhook received without signature header');
            throw new UnauthorizedException('Missing webhook signature');
        }

        const body = JSON.stringify(request.body);
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(body)
            .digest('hex');

        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        // Reject if lengths differ (timingSafeEqual requires equal-length buffers)
        if (sigBuffer.length !== expectedBuffer.length) {
            this.logger.warn('Webhook signature verification failed (length mismatch)');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);

        if (!isValid) {
            this.logger.warn('Webhook signature verification failed');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        return true;
    }
}
