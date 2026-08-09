import Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  GAZETTE_PUBLIC_URL: string;
  GAZETTE_UI_URL?: string;
  UPLOAD_PATH: string;
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_NAME: string;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  DATABASE_SYNCHRONIZE: boolean;
  IDENTITY_HUB_PUBLIC_URL: string;
  IDENTITY_HUB_INTERNAL_URL?: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  BOOTSTRAP_ADMIN_EXTERNAL_KEY?: string;
}

const portSchema = Joi.number().integer().min(1).max(65535);
const httpUrlSchema = Joi.string().uri({ scheme: ['http', 'https'], allowRelative: false });

export const environmentValidationSchema: Joi.ObjectSchema<EnvironmentVariables> = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: portSchema.default(7000),
  GAZETTE_PUBLIC_URL: httpUrlSchema.required(),
  GAZETTE_UI_URL: httpUrlSchema.optional(),
  UPLOAD_PATH: Joi.string().trim().min(1).default('storage/uploads'),
  DATABASE_HOST: Joi.string().trim().min(1).required(),
  DATABASE_PORT: portSchema.default(5432),
  DATABASE_NAME: Joi.string().trim().min(1).required(),
  DATABASE_USER: Joi.string().trim().min(1).required(),
  DATABASE_PASSWORD: Joi.string().min(1).required(),
  DATABASE_SYNCHRONIZE: Joi.boolean()
    .when('NODE_ENV', { is: 'production', then: Joi.valid(false) })
    .default(false),
  IDENTITY_HUB_PUBLIC_URL: httpUrlSchema.required(),
  IDENTITY_HUB_INTERNAL_URL: httpUrlSchema.optional(),
  OAUTH_CLIENT_ID: Joi.string().trim().min(1).required(),
  OAUTH_CLIENT_SECRET: Joi.string().min(1).required(),
  BOOTSTRAP_ADMIN_EXTERNAL_KEY: Joi.string().trim().min(1).optional(),
});
