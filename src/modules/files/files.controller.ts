import { Post, Query, Controller, UploadedFile, UseInterceptors, ParseFilePipeBuilder } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CustomFileTypeValidator } from './validators/custom-file-type.validator';
import { UploadDocumentQueryDto } from './dtos';
import { FilesService } from './files.service';
import { RequireRole } from 'src/modules/auth/decorators';
import { UserRole } from 'src/modules/users/entities';

@RequireRole(UserRole.USER)
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addValidator(
          new CustomFileTypeValidator({
            validTypes: ['application/pdf'],
          }),
        )
        .addMaxSizeValidator({ maxSize: 20 * 1024 * 1024 })
        .build(),
    )
    file: Express.Multer.File,
    @Query() queryParams: UploadDocumentQueryDto,
  ) {
    const year = queryParams.year || new Date().getFullYear();
    return this.filesService.uploadDocument(file, year);
  }
}
