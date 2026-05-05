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

  @IsString()
  UPLOAD_PATH: string;

  @IsString()
  IDENTITY_HUB_URL: string;

  @IsString()
  OAUTH_CLIENT_ID: string;

  @IsString()
  OAUTH_CLIENT_SECRET: string;

  @IsString()
  OAUTH_REDIRECT_URI: string;

  @IsString()
  @IsNotEmpty()
  AUTH_SUCCESS_REDIRECT: string;

  @IsString()
  @IsNotEmpty()
  AUTH_ERROR_REDIRECT: string;

  @IsIn(['development', 'production'])
  NODE_ENV: 'development' | 'production';

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  IDENTITY_COOKIE_SECURE: boolean;

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
