import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreateDocumentDto, FindAllDocumentsQueryDto, UpdateDocumentDto } from '../dtos';
import { DocumentService, DocumentTypeService } from '../services';
import { GetAuthUser } from 'src/modules/auth/decorators';
import { User } from 'src/modules/users/entities';

@Controller('documents')
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private documentTypeService: DocumentTypeService,
  ) {}

  @Get('types')
  getDocumentTypes() {
    return this.documentTypeService.getTypeOptions();
  }

  @Post()
  create(@Body() body: CreateDocumentDto, @GetAuthUser() user: User) {
    return this.documentService.create(body, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateDocumentDto, @GetAuthUser() user: User) {
    return this.documentService.update(id, body, user);
  }

  @Get()
  findAll(@Query() params: FindAllDocumentsQueryDto) {
    return this.documentService.findAll(params);
  }

  @Get(':id')
  getDocumentDetail(@Param('id') id: string) {
    return this.documentService.getDocumentDetail(id);
  }
}
