import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { join } from 'path';

import { EnvironmentVariables, validate } from './config';

import { DocumentsModule } from './modules/documents/documents.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          host: configService.getOrThrow<string>('DATABASE_HOST'),
          port: +configService.getOrThrow<number>('DATABASE_PORT'),
          database: configService.getOrThrow<string>('DATABASE_NAME'),
          username: configService.getOrThrow<string>('DATABASE_USER'),
          password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
          autoLoadEntities: true,
          synchronize: !isProduction,
        };
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'browser'),
      exclude: ['/api/{*path}', '/files/{*path}'],
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
