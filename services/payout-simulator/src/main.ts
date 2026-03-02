import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Security headers & CORS
    app.use(helmet());
    app.enableCors();

    // Graceful shutdown
    app.enableShutdownHooks();

    // Swagger configuration
    const config = new DocumentBuilder()
        .setTitle('Payout Partner Simulator API')
        .setDescription('Simulates a third-party payout partner with webhooks')
        .setVersion('1.0')
        .addTag('payouts', 'Payout Simulator operations')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    const port = process.env.PAYOUT_SERVICE_PORT || 3002;
    await app.listen(port);
    Logger.log(`Payout Partner Simulator running on port ${port}`, 'Bootstrap');
}
bootstrap();
