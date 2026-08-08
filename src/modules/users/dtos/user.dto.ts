import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../entities';

export class UpdateUserDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  @ArrayMinSize(1)
  roles: UserRole[];
}

export class SearchIdentityCandidatesDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  term = '';
}

export class ImportUserFromIdentityDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  externalKey: string;

  @IsArray()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  @ArrayMinSize(1)
  roles: UserRole[];
}
