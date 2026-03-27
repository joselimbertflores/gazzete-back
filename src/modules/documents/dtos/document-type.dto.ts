import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentNumberingMode } from '../entities';
import { PartialType } from '@nestjs/mapped-types';

export class CreateDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(DocumentNumberingMode)
  numberingMode: DocumentNumberingMode;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDocumentTypeDto extends PartialType(CreateDocumentTypeDto) {}
