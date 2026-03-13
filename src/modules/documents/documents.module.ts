import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentTypeController } from './controllers/document-type.controller';
import { DocumentRecord, DocumentRelation, DocumentType } from './entities';
import { DocumentTypeService } from './services/document-type.service';

@Module({
  controllers: [DocumentTypeController],
  imports: [TypeOrmModule.forFeature([DocumentRecord, DocumentRelation, DocumentType])],
  providers: [DocumentTypeService],
  exports: [DocumentTypeService],
})
export class DocumentsModule {}
