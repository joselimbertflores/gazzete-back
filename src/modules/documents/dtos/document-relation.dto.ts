import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DocumentRelationType } from '../entities';

export class SaveDocumentRelationDto {
  @IsUUID()
  sourceDocumentId: string;

  @IsEnum(DocumentRelationType)
  type: DocumentRelationType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

import { Transform } from 'class-transformer';

export class SearchRelationCandidatesDto {
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (value as string)?.trim())
  term: string;

  @IsOptional()
  @IsUUID()
  excludeDocumentId?: string;
}
