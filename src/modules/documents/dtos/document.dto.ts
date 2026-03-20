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
import { DocumentLegalStatus, DocumentRelationType } from '../entities';
import { PaginationParamsDto } from 'src/modules/common';

export class DocumentRelationDto {
  @IsEnum(DocumentRelationType)
  type: DocumentRelationType;

  @IsUUID()
  targetDocumentId: string;
}
export class CreateDocumentDto {
  @IsInt()
  @Type(() => Number)
  typeId: number;

  @IsInt()
  @Type(() => Number)
  correlativeNumber: number;

  @IsString()
  @IsNotEmpty()
  title: string;

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
  promulgationDate: Date;

  @IsDate()
  @Type(() => Date)
  publicationDate: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  validUntil?: Date;

  @IsUUID()
  fileId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentRelationDto)
  @IsOptional()
  relations?: DocumentRelationDto[];
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
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsEnum(DocumentLegalStatus)
  publicationStatus?: DocumentLegalStatus;
}
