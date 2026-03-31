import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

import { DocumentLegalStatus } from '../entities/document.entity';
import { PaginationParamsDto } from 'src/modules/common';

export class FindPublicDocumentsDto extends PaginationParamsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  typeId?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  year?: number;

  @IsOptional()
  @IsEnum(DocumentLegalStatus)
  legalStatus?: DocumentLegalStatus;
}
