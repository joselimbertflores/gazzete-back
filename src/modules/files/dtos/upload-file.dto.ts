import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadDocumentQueryDto {
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(2000)
  @Max(new Date().getFullYear())
  @IsOptional()
  year?: number;
}
