import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { StoredFile } from './entities/stored-file.entity';
import { FileImporterService } from './file-importer.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileImporterService],
  exports: [FilesService, FileImporterService],
  imports: [TypeOrmModule.forFeature([StoredFile])],
})
export class FilesModule {}
