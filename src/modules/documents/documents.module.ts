import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  DocumentController,
  PublicDocumentsController,
  DocumentTypeController,
  DocumentRelationController,
} from './controllers';
import { PublicDocumentsService, DocumentRelationService, DocumentService, DocumentTypeService } from './services';
import { DocumentRecord, DocumentRelation, DocumentRecordType } from './entities';
import { FilesModule } from '../files/files.module';
import { GazetteImporterService } from './import/gazette-importer.service';

@Module({
  controllers: [DocumentTypeController, DocumentController, DocumentRelationController, PublicDocumentsController],
  imports: [TypeOrmModule.forFeature([DocumentRecord, DocumentRelation, DocumentRecordType]), FilesModule],
  providers: [
    DocumentService,
    DocumentTypeService,
    PublicDocumentsService,
    DocumentRelationService,
    GazetteImporterService,
  ],
  exports: [DocumentTypeService],
})
export class DocumentsModule {}
