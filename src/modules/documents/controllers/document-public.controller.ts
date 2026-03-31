import { Controller, Get, Query } from '@nestjs/common';

import { DocumentPublicService } from '../services';
import { FindPublicDocumentsDto } from '../dtos';
import { Public } from 'src/modules/auth/decorators';

@Public()
@Controller('documents-public')
export class DocumentPublicController {
  constructor(private readonly documentsPublicService: DocumentPublicService) {}

  @Get()
  findAll(@Query() queryParams: FindPublicDocumentsDto) {
    return this.documentsPublicService.findAll(queryParams);
  }
}
