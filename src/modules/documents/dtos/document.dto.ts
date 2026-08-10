import {
  IsDate,
  IsEnum,
  IsInt,
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { DocumentLegalStatus, DocumentRecordStatus, DocumentRelationType } from '../entities';
import { IsAfterOrEqual, IsBeforeOrEqual } from '../validators';
import { DOCUMENT_SUFFIX_MAX_LENGTH, DOCUMENT_SUFFIX_PATTERN, normalizeDocumentSuffix } from '../helpers';
import { PaginationParamsDto } from 'src/modules/common';

function normalizeSuffixInput(value: unknown): unknown {
  return typeof value === 'string' || value == null ? normalizeDocumentSuffix(value) : value;
}

export class CreateDocumentDto {
  @IsInt()
  @Type(() => Number)
  typeId: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  correlativeNumber: number;

  @Transform(({ value }) => normalizeSuffixInput(value as unknown))
  @IsOptional()
  @MaxLength(DOCUMENT_SUFFIX_MAX_LENGTH)
  @Matches(DOCUMENT_SUFFIX_PATTERN)
  suffix?: string | null;

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
  publicationDate: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @IsAfterOrEqual('publicationDate', {
    message: 'La vigencia no puede ser anterior a la publicación',
  })
  validUntil?: Date;

  @IsUUID()
  fileId: string;

  @IsEnum(DocumentRecordStatus)
  @IsOptional()
  status?: DocumentRecordStatus;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;
}

export class UploadDocumentFileQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(new Date().getFullYear())
  year: number;
}

export class UpdateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  summary?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @IsBeforeOrEqual('publicationDate', {
    message: 'La fecha de promulgación no puede ser posterior a la publicación',
  })
  promulgationDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  publicationDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @IsAfterOrEqual('publicationDate', {
    message: 'La vigencia no puede ser anterior a la publicación',
  })
  validUntil?: Date;

  @IsUUID()
  @IsOptional()
  fileId?: string;

  @IsEnum(DocumentRecordStatus)
  @IsOptional()
  status?: DocumentRecordStatus;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;
}

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
