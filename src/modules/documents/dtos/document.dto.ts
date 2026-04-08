import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

import { DocumentLegalStatus, DocumentRelationType } from '../entities';
import { PaginationParamsDto } from 'src/modules/common';
import { IsAfterOrEqual, IsBeforeOrEqual } from '../validators';
export class CreateDocumentDto {
  @IsInt()
  @Type(() => Number)
  typeId: number;

  @IsInt()
  @Type(() => Number)
  correlativeNumber: number;

  @IsString()
  @IsNotEmpty()
  summary: string;

  @IsNumber()
  @Min(2000)
  @Max(new Date().getFullYear())
  @Type(() => Number)
  year: number;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @IsBeforeOrEqual('publicationDate', {
    message: 'La fecha de promulgación no puede ser posterior a la publicación',
  })
  promulgationDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsAfterOrEqual('publicationDate', {
    message: 'La vigencia no puede ser anterior a la publicación',
  })
  publicationDate: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  validUntil?: Date;

  @IsUUID()
  fileId: string;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class SearchDocumentForRelationDto {
  @IsString()
  @IsNotEmpty()
  term: string;

  @IsUUID()
  @IsOptional()
  sourceDocumentId?: string;
}

export class FindAllDocumentsQueryDto extends PaginationParamsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  typeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsEnum(DocumentLegalStatus)
  legalStatus?: DocumentLegalStatus;
}

export class ChangeDocumentStatusDto {
  @IsUUID()
  sourceDocumentId: string;

  @IsEnum(DocumentRelationType)
  relationType: DocumentRelationType;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;
}
