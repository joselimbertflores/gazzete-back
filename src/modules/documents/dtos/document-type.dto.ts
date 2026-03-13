import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateDocumentTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
