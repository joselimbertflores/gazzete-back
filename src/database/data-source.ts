import 'dotenv/config';
import { join } from 'path';

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '../config';

const configService = new ConfigService<EnvironmentVariables>();
const databasePort = Number(configService.getOrThrow<number>('DATABASE_PORT'));

if (!Number.isInteger(databasePort)) {
  throw new Error('DATABASE_PORT must be a valid integer.');
}

export default new DataSource({
  type: 'postgres',
  host: configService.getOrThrow<string>('DATABASE_HOST'),
  port: databasePort,
  database: configService.getOrThrow<string>('DATABASE_NAME'),
  username: configService.getOrThrow<string>('DATABASE_USER'),
  password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
  synchronize: false,
  entities: [join(__dirname, '..', 'modules', '**', 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
});
