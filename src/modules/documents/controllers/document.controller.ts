import { Controller, Get, Post } from '@nestjs/common';

import { CreateDocumentDto } from '../dtos/document.dto';
import { DocumentService, DocumentTypeService } from '../services';

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
  create(body: CreateDocumentDto) {
    return this.documentService.create(body);
  }
}
