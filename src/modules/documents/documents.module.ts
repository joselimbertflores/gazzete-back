import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentController, DocumentPublicController, DocumentTypeController } from './controllers';
import { DocumentPublicService, DocumentService, DocumentTypeService } from './services';
import { DocumentRecord, DocumentRelation, DocumentRecordType } from './entities';
import { FilesModule } from '../files/files.module';
import { GazetteImporterService } from './import/gazette-importer.service';

@Module({
  controllers: [DocumentTypeController, DocumentController, DocumentPublicController],
  imports: [TypeOrmModule.forFeature([DocumentRecord, DocumentRelation, DocumentRecordType]), FilesModule],
  providers: [DocumentTypeService, DocumentService, DocumentPublicService, GazetteImporterService],
  exports: [DocumentTypeService],
})
export class DocumentsModule {}
