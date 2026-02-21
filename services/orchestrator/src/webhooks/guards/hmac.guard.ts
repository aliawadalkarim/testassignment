import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import configuration from '../../common/config/configuration';

@Injectable()
export class HmacGuard implements CanActivate {
    private readonly logger = new Logger(HmacGuard.name);
    private readonly webhookSecret: string;

    constructor() {
        this.webhookSecret = configuration().webhookSecret;
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

        const isValid = crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex'),
        );

        if (!isValid) {
            this.logger.warn('Webhook signature verification failed');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        return true;
    }
}
