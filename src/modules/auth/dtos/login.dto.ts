import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  login: string;

  @IsNotEmpty()
  password: string;
}

export class AuthCallbackParamsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  error?: string;

  @IsOptional()
  @IsString()
  client_name?: string;
}
