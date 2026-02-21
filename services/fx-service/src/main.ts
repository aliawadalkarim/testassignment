import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.enableCors();

    const port = process.env.FX_SERVICE_PORT || 3001;
    await app.listen(port);
    Logger.log(`FX Quote Service running on port ${port}`, 'Bootstrap');
}
bootstrap();
