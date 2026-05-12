import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import {
  ChangeDocumentStatusDto,
  CreateDocumentDto,
  FindAllDocumentsQueryDto,
  SearchDocumentForRelationDto,
  UpdateDocumentDto,
} from '../dtos';
import { DocumentService, DocumentTypeService } from '../services';
import { User } from 'src/modules/users/entities';
import { GetAuthUser } from 'src/modules/auth/decorators';

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
  create(@Body() body: CreateDocumentDto, @GetAuthUser() user: User) {
    return this.documentService.create(body, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateDocumentDto) {
    return this.documentService.update(id, body);
  }

  @Get()
  findAll(@Query() params: FindAllDocumentsQueryDto) {
    return this.documentService.findAll(params);
  }

  @Get('search-for-relation')
  searchForRelation(@Query() queryParams: SearchDocumentForRelationDto) {
    return this.documentService.searchRelationCandidates(queryParams);
  }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeDocumentStatusDto) {
    return this.documentService.changeStatus(id, dto);
  }

  @Get(':id/relation')
  findRelationByTarget(@Param('id') id: string) {
    return this.documentService.findRelationByTarget(id);
  }
}
