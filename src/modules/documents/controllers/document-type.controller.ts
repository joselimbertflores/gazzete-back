import { Body, Get, Post, Patch, Param, Delete, ParseIntPipe, Controller } from '@nestjs/common';

import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dtos/document-type.dto';
import { DocumentTypeService } from '../services/document-type.service';

@Controller('document-types')
export class DocumentTypeController {
  constructor(private readonly documentTypeService: DocumentTypeService) {}

  @Post()
  create(@Body() createDocumentTypeDto: CreateDocumentTypeDto) {
    return this.documentTypeService.create(createDocumentTypeDto);
  }

  @Get()
  findAll() {
    return this.documentTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateDocumentTypeDto: UpdateDocumentTypeDto) {
    return this.documentTypeService.update(id, updateDocumentTypeDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.remove(id);
  }
}
