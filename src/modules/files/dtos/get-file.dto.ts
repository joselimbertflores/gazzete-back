import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { FileGroup } from '../file-group.enum';

export class GetFileDto {
  @IsEnum(FileGroup)
  group: FileGroup;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}
