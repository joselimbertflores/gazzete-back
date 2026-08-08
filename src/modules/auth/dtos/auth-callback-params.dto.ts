import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AuthCallbackParamsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  state?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  error?: string;
}
