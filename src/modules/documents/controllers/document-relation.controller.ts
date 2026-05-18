import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';

import { DocumentRelationService } from '../services';
import { SearchRelationCandidatesDto, SaveDocumentRelationDto } from '../dtos';

@Controller('document-relations')
export class DocumentRelationController {
  constructor(private readonly relationsService: DocumentRelationService) {}

  @Get('candidates')
  findCandidates(@Query() query: SearchRelationCandidatesDto) {
    return this.relationsService.findCandidates(query);
  }

  @Get(':targetId')
  findByTarget(@Param('targetId') targetId: string) {
    return this.relationsService.findByTarget(targetId);
  }

  @Put(':targetId')
  save(@Param('targetId') targetId: string, @Body() dto: SaveDocumentRelationDto) {
    return this.relationsService.save(targetId, dto);
  }

  @Delete(':targetId')
  remove(@Param('targetId') targetId: string) {
    return this.relationsService.remove(targetId);
  }
}
