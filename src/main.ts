import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import cookieParser from 'cookie-parser';

import { EnvironmentVariables } from './config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/login', method: RequestMethod.GET },
      { path: 'auth/callback', method: RequestMethod.GET },
      { path: 'public-documents/:id/file', method: RequestMethod.GET },
      { path: 'sitemap.xml', method: RequestMethod.GET },
      { path: 'robots.txt', method: RequestMethod.GET },
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

  const publicOrigin = new URL(configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true })).origin;
  const uiUrl = configService.get('GAZETTE_UI_URL', { infer: true });

  if (uiUrl && new URL(uiUrl).origin !== publicOrigin) {
    app.enableCors({ origin: new URL(uiUrl).origin, credentials: true });
  }

  await app.listen(configService.getOrThrow('PORT', { infer: true }));
}
void bootstrap();
