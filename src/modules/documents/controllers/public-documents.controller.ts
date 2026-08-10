import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';

import type { Response } from 'express';

import { PublicDocumentsService } from '../services';
import { Public } from 'src/modules/auth/decorators';
import { FindPublicDocumentsDto } from '../dtos';

@Public()
@Controller('public-documents')
export class PublicDocumentsController {
  constructor(private readonly publicDocumentsService: PublicDocumentsService) {}

  @Get(':id/file')
  async getDocumentFile(
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('download') download?: string,
  ) {
    const isDownload = download === 'true';

    const { stream, file } = await this.publicDocumentsService.getPublicDocumentFileStream(id, {
      countDownload: isDownload,
    });

    const disposition = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('Content-Length', file.sizeBytes);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(stream);
  }

  @Get('landing')
  getLandingData() {
    return this.publicDocumentsService.getLandingData();
  }

  @Get('types')
  getTypeOptions() {
    return this.publicDocumentsService.getTypeOptions();
  }

  @Get()
  findAll(@Query() queryParams: FindPublicDocumentsDto) {
    return this.publicDocumentsService.findAll(queryParams);
  }

  @Get('detail/:slug')
  getPublicDocumentDetail(@Param('slug') slug: string) {
    return this.publicDocumentsService.getDocumentDetail(slug);
  }
}
