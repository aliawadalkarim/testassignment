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
        .setTitle('FX Quote Service API')
        .setDescription('Provides live and cached FX rates with configurable spreads')
        .setVersion('1.0')
        .addTag('quotes', 'FX Quotes operations')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    const port = process.env.FX_SERVICE_PORT || 3001;
    await app.listen(port);
    Logger.log(`FX Quote Service running on port ${port}`, 'Bootstrap');
}
bootstrap();
