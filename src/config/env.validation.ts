import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsNumber()
  PORT: number;

  @IsString()
  HOST: string;

  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  DATABASE_PORT: number;

  @IsString()
  DATABASE_NAME: string;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsIn(['true', 'false'])
  DB_SYNCHRONIZE: 'true' | 'false';

  @IsString()
  UPLOAD_PATH: string;

  @IsString()
  IDENTITY_HUB_URL: string;

  @IsString()
  IDENTITY_HUB_INTERNAL_URL: string;

  @IsString()
  OAUTH_CLIENT_ID: string;

  @IsString()
  OAUTH_CLIENT_SECRET: string;

  @IsString()
  OAUTH_REDIRECT_URI: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  BOOTSTRAP_ADMIN_EXTERNAL_KEY?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GAZETTE_UI_BASE_URL?: string;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  AUTH_COOKIE_SECURE: boolean;

  @IsString()
  @IsNotEmpty()
  OAUTH_ISSUER: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
