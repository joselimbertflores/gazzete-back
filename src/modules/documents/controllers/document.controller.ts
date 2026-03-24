import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreateDocumentDto, SearchDocumentForRelationDto, UpdateDocumentDto } from '../dtos';
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateDocumentDto) {
    return this.documentService.update(id, body);
  }

  @Get()
  findAll(@Query() params: PaginationParamsDto) {
    return this.documentService.findAll(params);
  }

  @Get('search-for-relation')
  searchForRelation(@Query() queryParams: SearchDocumentForRelationDto) {
    return this.documentService.searchRelationCandidates(queryParams);
  }

  @Get(':id/relations')
  findRelations(@Param('id') id: string) {
    return this.documentService.findOutgoingRelationsByDocumentId(id);
  }
}
