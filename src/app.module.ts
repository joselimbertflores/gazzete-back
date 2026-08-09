import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { join } from 'path';

import { EnvironmentVariables, environmentValidationSchema } from './config';

import { DocumentsModule } from './modules/documents/documents.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>) => {
        return {
          type: 'postgres',
          host: configService.getOrThrow('DATABASE_HOST', { infer: true }),
          port: configService.getOrThrow('DATABASE_PORT', { infer: true }),
          database: configService.getOrThrow('DATABASE_NAME', { infer: true }),
          username: configService.getOrThrow('DATABASE_USER', { infer: true }),
          password: configService.getOrThrow('DATABASE_PASSWORD', { infer: true }),
          autoLoadEntities: true,
          synchronize: configService.getOrThrow('DATABASE_SYNCHRONIZE', { infer: true }),
        };
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'browser'),
      exclude: ['/api/{*path}', '/auth/login', '/auth/callback', '/public-documents/{*path}'],
    }),
    AuthModule,
    UsersModule,
    FilesModule,
    DocumentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
