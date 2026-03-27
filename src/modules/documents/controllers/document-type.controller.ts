import { Body, Get, Post, Patch, Param, ParseIntPipe, Controller } from '@nestjs/common';

import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dtos/document-type.dto';
import { DocumentTypeService } from '../services/document-type.service';

@Controller('document-types')
export class DocumentTypeController {
  constructor(private readonly documentTypeService: DocumentTypeService) {}

  @Get()
  findAll() {
    return this.documentTypeService.findAll();
  }

  @Post()
  create(@Body() body: CreateDocumentTypeDto) {
    return this.documentTypeService.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateDocumentTypeDto) {
    return this.documentTypeService.update(id, body);
  }
}
