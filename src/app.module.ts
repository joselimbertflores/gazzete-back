import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

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
    AuthModule,
    UsersModule,
    FilesModule,
    DocumentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
