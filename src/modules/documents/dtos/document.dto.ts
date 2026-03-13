import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  validUntil: Date;
  file;
  fileId;
  createdAt;
  updatedAt;
}
