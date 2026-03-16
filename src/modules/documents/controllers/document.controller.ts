import { Controller, Post } from '@nestjs/common';

import { CreateDocumentDto } from '../dtos/document.dto';
import { DocumentService } from '../services';

@Controller('documents')
export class DocumentController {
  constructor(private documentService: DocumentService) {}

  @Post()
  create(body: CreateDocumentDto) {
    return this.documentService.create(body);
  }
}
