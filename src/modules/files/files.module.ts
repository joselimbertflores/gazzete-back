import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { StoredFile } from './entities/stored-file.entity';

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
  imports: [TypeOrmModule.forFeature([StoredFile])],
})
export class FilesModule {}
