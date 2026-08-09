import 'dotenv/config';
import { INestApplicationContext, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from 'src/app.module';
import { EnvironmentVariables } from 'src/config';
import { UsersService } from 'src/modules/users/users.service';

async function bootstrap() {
  let app: INestApplicationContext | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule);
    const configService = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    const externalKey = getBootstrapAdminExternalKey(configService);

    const usersService = app.get(UsersService);
    const result = await usersService.bootstrapInitialAdmin(externalKey);

    if (result.status === 'admin-already-exists') {
      console.log('Ya existe al menos un ADMIN local. No se creó ningún usuario.');
      return;
    }

    console.log(`ADMIN local creado correctamente para ${result.user.externalKey}.`);
  } catch (error) {
    process.exitCode = 1;

    if (error instanceof NotFoundException) {
      console.error(
        'Identity Hub no encontró el usuario solicitado. El usuario no existe, está inactivo o no tiene acceso a Gaceta.',
      );
      return;
    }

    console.error(error instanceof Error ? error.message : error);
  } finally {
    await app?.close();
  }
}

function getBootstrapAdminExternalKey(configService: ConfigService<EnvironmentVariables, true>): string {
  const externalKey = configService.get('BOOTSTRAP_ADMIN_EXTERNAL_KEY', { infer: true })?.trim();

  if (!externalKey) {
    throw new Error('BOOTSTRAP_ADMIN_EXTERNAL_KEY es obligatoria y no puede estar vacía.');
  }

  return externalKey;
}

void bootstrap();
