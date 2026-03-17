import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentRecord, DocumentRelation, DocumentRecordType } from './entities';
import { DocumentController, DocumentTypeController } from './controllers';
import { DocumentService, DocumentTypeService } from './services';
import { FilesModule } from '../files/files.module';

@Module({
  controllers: [DocumentTypeController, DocumentController],
  imports: [TypeOrmModule.forFeature([DocumentRecord, DocumentRelation, DocumentRecordType]), FilesModule],
  providers: [DocumentTypeService, DocumentService],
  exports: [DocumentTypeService],
})
export class DocumentsModule {}
