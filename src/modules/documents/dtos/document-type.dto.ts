import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

import { DocumentNumberingMode } from '../entities';

export class CreateDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DocumentNumberingMode)
  numberingMode: DocumentNumberingMode;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDocumentTypeDto extends PartialType(CreateDocumentTypeDto) {}
