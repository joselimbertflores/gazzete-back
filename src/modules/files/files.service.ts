import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { mkdir, unlink, writeFile } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { dirname, join } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';

import mime from 'mime-types';

import { StoredFile } from './entities/stored-file.entity';

export class UploadedFileResult {
  id: string;
  name: string;
}

@Injectable()
export class FilesService {
  private readonly BASE_UPLOAD_PATH: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(StoredFile) private fileRepository: Repository<StoredFile>,
  ) {
    const uploadPath = this.configService.getOrThrow<string>('UPLOAD_PATH');
    this.BASE_UPLOAD_PATH = join(process.cwd(), uploadPath);
  }

  async uploadDocument(file: Express.Multer.File, year: number): Promise<UploadedFileResult> {
    const extension = mime.extension(file.mimetype);

    if (!extension) throw new Error(`Unsupported mime type: ${file.mimetype}`);

    const storedName = `${uuid()}.${extension}`;
    const storageKey = `documents/${year}/${storedName}`;
    const finalPath = join(this.BASE_UPLOAD_PATH, storageKey);

    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, file.buffer);

    const normalizedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    try {
      const entity = this.fileRepository.create({
        storageKey,
        originalName: normalizedName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });
      const createdFile = await this.fileRepository.save(entity);
      return {
        id: createdFile.id,
        name: createdFile.originalName,
      };
    } catch (error: unknown) {
      await unlink(finalPath);
      throw error;
    }
  }

  async findFileOrFail(id: string): Promise<StoredFile> {
    const file = await this.fileRepository.findOne({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async getFileStream(id: string) {
    const file = await this.findFileOrFail(id);

    const finalPath = join(this.BASE_UPLOAD_PATH, file.storageKey);

    if (!existsSync(finalPath)) {
      throw new NotFoundException('File not found');
    }

    const stream = createReadStream(finalPath);

    return { stream, file };
  }

  buildPublicFileUrl(id: string) {
    const host = this.configService.getOrThrow<string>('HOST');
    return `${host}/files/${id}`;
  }
}
