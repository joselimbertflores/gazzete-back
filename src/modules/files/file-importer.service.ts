import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { EntityManager, Repository } from 'typeorm';
import { basename, dirname, join } from 'path';
import { v4 as uuid } from 'uuid';
import mime from 'mime-types';

import { StoredFile, StoredFileStatus } from './entities/stored-file.entity';

@Injectable()
export class FileImporterService {
  private readonly BASE_UPLOAD_PATH: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(StoredFile) private fileRepository: Repository<StoredFile>,
  ) {
    const uploadPath = this.configService.getOrThrow<string>('UPLOAD_PATH');
    this.BASE_UPLOAD_PATH = join(process.cwd(), uploadPath);
  }

  async createFromPath(filePath: string, year: number, manager?: EntityManager): Promise<StoredFile> {
    const repo = manager ? manager.getRepository(StoredFile) : this.fileRepository;

    const buffer = await readFile(filePath);

    const mimeType = 'application/pdf';
    const extension = mime.extension(mimeType);

    if (!extension) {
      throw new Error(`Unsupported mime type: ${mimeType}`);
    }

    const storedName = `${uuid()}.${extension}`;
    const storageKey = `documents/${year}/${storedName}`;
    const finalPath = join(this.BASE_UPLOAD_PATH, storageKey);

    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, buffer);

    try {
      const entity = repo.create({
        storageKey,
        originalName: basename(filePath),
        mimeType,
        sizeBytes: buffer.length,
        status: StoredFileStatus.PENDING,
      });

      return await repo.save(entity);
    } catch (error) {
      await unlink(finalPath);
      throw error;
    }
  }
}
