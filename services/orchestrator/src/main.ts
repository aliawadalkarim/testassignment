import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    // Security headers & CORS
    app.use(helmet());
    app.enableCors();

    // Graceful shutdown
    app.enableShutdownHooks();

    // Swagger configuration
    const config = new DocumentBuilder()
        .setTitle('Remittance Orchestrator API')
        .setDescription('Coordinates FX quotes, compliance checks, and payout simulations')
        .setVersion('1.0')
        .addTag('transfers', 'Transfer Lifecycle Management')
        .addTag('webhooks', 'Partner Callbacks')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);
    Logger.log(`Remittance Orchestrator running on port ${port}`, 'Bootstrap');
}
bootstrap();
