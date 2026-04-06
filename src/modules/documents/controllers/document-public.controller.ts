import { Controller, Get, Param, Query } from '@nestjs/common';

import { DocumentPublicService, DocumentTypeService } from '../services';
import { FindPublicDocumentsDto } from '../dtos';
import { Public } from 'src/modules/auth/decorators';

@Public()
@Controller('documents-public')
export class DocumentPublicController {
  constructor(
    private readonly documentsPublicService: DocumentPublicService,
    private readonly docTypesService: DocumentTypeService,
  ) {}

  @Get()
  findAll(@Query() queryParams: FindPublicDocumentsDto) {
    return this.documentsPublicService.findAll(queryParams);
  }

  @Get('types')
  getDocumentTypes() {
    return this.docTypesService.getActiveTypes();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsPublicService.findOne(id);
  }
}
