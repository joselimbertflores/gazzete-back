import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/login', method: RequestMethod.GET },
      { path: 'auth/callback', method: RequestMethod.GET },
      { path: 'files/:id', method: RequestMethod.GET },
    ],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (process.env.NODE_ENV === 'development' && process.env.CORS_ORIGIN) {
    app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
