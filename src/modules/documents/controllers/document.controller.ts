import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateDocumentDto } from '../dtos/document.dto';
import { DocumentService, DocumentTypeService } from '../services';
import { PaginationParamsDto } from 'src/modules/common';

@Controller('documents')
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private documentTypeService: DocumentTypeService,
  ) {}

  @Get('types')
  getDocumentTypes() {
    return this.documentTypeService.getActiveTypes();
  }

  @Post()
  create(@Body() body: CreateDocumentDto) {
    return this.documentService.create(body);
  }

  @Get()
  findAll(@Param() params: PaginationParamsDto) {
    return this.documentService.findAll(params);
  }
}
