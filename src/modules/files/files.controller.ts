import {
  Get,
  Res,
  Post,
  Param,
  Query,
  Controller,
  UploadedFile,
  StreamableFile,
  UseInterceptors,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CustomFileTypeValidator } from './validators/custom-file-type.validator';
import { FilesService } from './files.service';
import { UploadDocumentQueryDto } from './dtos';

// @Public()
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

  @Get(':id')
  async serveFile(
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('download') download?: string,
  ) {
    const { stream, file } = await this.filesService.getFileStream(id);

    const isDownload = download === 'true';
    const disposition = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('Content-Length', file.sizeBytes);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(stream);
  }
}
