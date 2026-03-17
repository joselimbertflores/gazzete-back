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
} from 'class-validator';
import { DocumentRelationType } from '../entities';

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
  number: number;

  @IsInt()
  @Type(() => Number)
  year: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  summary: string;

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
