import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';

import type { Response } from 'express';

import { DocumentPublicService, DocumentTypeService } from '../services';
import { Public } from 'src/modules/auth/decorators';
import { FindPublicDocumentsDto } from '../dtos';

@Public()
@Controller('public-documents')
export class PublicDocumentsController {
  constructor(
    private readonly documentsPublicService: DocumentPublicService,
    private readonly docTypesService: DocumentTypeService,
  ) {}

  @Get()
  findAll(@Query() queryParams: FindPublicDocumentsDto) {
    return this.documentsPublicService.findAll(queryParams);
  }

  @Get('types')
  getTypes() {
    return this.docTypesService.getActiveTypes();
  }

  @Get('recent')
  getRecent() {
    return this.documentsPublicService.findRecent();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsPublicService.findOne(id);
  }

  @Public()
  @Get(':id/file')
  async getDocumentFile(
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('download') download?: string,
  ) {
    const isDownload = download === 'true';

    const { stream, file } = await this.documentsPublicService.getPublicDocumentFileStream(id, {
      countDownload: isDownload,
    });

    const disposition = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('Content-Length', file.sizeBytes);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(stream);
  }
}
