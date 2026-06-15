import { IsNotEmpty, IsString, IsOptional, IsArray, IsEnum, ArrayMinSize } from 'class-validator';
import { UserRole } from '../entities';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsOptional()
  password?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @ArrayMinSize(1)
  roles: UserRole[];
}

export class SearchIdentityCandidatesDto {
  @IsOptional()
  @IsString()
  term = '';
}

export class ImportUserFromIdentityDto {
  @IsNotEmpty()
  @IsString()
  externalKey: string;

  @IsArray()
  @IsEnum(UserRole, { each: true })
  @ArrayMinSize(1)
  roles: UserRole[];
}
