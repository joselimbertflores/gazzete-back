import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { DocumentLegalStatus } from '../entities/document.entity';
import { PaginationParamsDto } from 'src/modules/common';

export class FindPublicDocumentsDto extends PaginationParamsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  year?: number;

  @IsOptional()
  @IsEnum(DocumentLegalStatus)
  legalStatus?: DocumentLegalStatus;
}
