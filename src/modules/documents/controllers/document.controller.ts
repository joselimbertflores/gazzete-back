import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CreateDocumentDto, SearchDocumentForRelationDto } from '../dtos';
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
  findAll(@Query() params: PaginationParamsDto) {
    return this.documentService.findAll(params);
  }

  @Get('search-for-relation')
  searchForRelation(@Query() queryParams: SearchDocumentForRelationDto) {
    return this.documentService.searchForRelation(queryParams);
  }
}
