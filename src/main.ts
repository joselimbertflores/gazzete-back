import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import cookieParser from 'cookie-parser';

import { EnvironmentVariables } from './config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvironmentVariables>);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/login', method: RequestMethod.GET },
      { path: 'auth/callback', method: RequestMethod.GET },
      { path: 'public-documents/:id/file', method: RequestMethod.GET },
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

  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  const nodeEnv = configService.getOrThrow<'development' | 'production'>('NODE_ENV');

  if (nodeEnv === 'development' && corsOrigin) {
    app.enableCors({ origin: corsOrigin, credentials: true });
  }

  await app.listen(configService.getOrThrow<number>('PORT'));
}
bootstrap();
