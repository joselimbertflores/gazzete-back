import { Type } from 'class-transformer';
import {
  IsInt,
  IsPositive,
  Min,
  Max,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
} from 'class-validator';

export class PaginationParamsDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(50)
  @IsOptional()
  readonly limit?: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  readonly offset?: number = 0;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9\s-]{1,255}$/, {
    message: 'El término de búsqueda contiene caracteres no válidos.',
  })
  readonly term?: string;
}
