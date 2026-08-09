import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { mkdir, unlink, writeFile } from 'fs/promises';
import { EntityManager, Repository } from 'typeorm';
import { createReadStream, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { v4 as uuid } from 'uuid';

import mime from 'mime-types';

import { StoredFile, StoredFileStatus } from './entities/stored-file.entity';
import { EnvironmentVariables } from 'src/config';

export class UploadedFileResult {
  id: string;
  name: string;
}

@Injectable()
export class FilesService {
  private readonly BASE_UPLOAD_PATH: string;

  constructor(
    private configService: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(StoredFile) private fileRepository: Repository<StoredFile>,
  ) {
    const uploadPath = this.configService.getOrThrow('UPLOAD_PATH', { infer: true });
    this.BASE_UPLOAD_PATH = resolve(process.cwd(), uploadPath);
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

    if (file.status !== StoredFileStatus.ACTIVE) {
      throw new NotFoundException();
    }

    const finalPath = join(this.BASE_UPLOAD_PATH, file.storageKey);

    if (!existsSync(finalPath)) {
      throw new NotFoundException('File not found');
    }

    const stream = createReadStream(finalPath);

    return { stream, file };
  }

  async getPendingFileOrFail(id: string, manager?: EntityManager): Promise<StoredFile> {
    const repo = manager ? manager.getRepository(StoredFile) : this.fileRepository;

    const file = await repo.findOne({ where: { id } });

    if (!file) throw new NotFoundException('File not found');

    if (file.status !== StoredFileStatus.PENDING) {
      throw new BadRequestException('File is not pending');
    }

    return file;
  }

  async markAsActive(id: string, manager?: EntityManager): Promise<StoredFile> {
    const repo = manager ? manager.getRepository(StoredFile) : this.fileRepository;

    const file = await repo.findOne({ where: { id } });

    if (!file) throw new NotFoundException('File not found');

    if (file.status !== StoredFileStatus.PENDING) throw new BadRequestException('Only pending files can be activated');

    file.status = StoredFileStatus.ACTIVE;

    return await repo.save(file);
  }

  async markAsDeleted(id: string, manager?: EntityManager): Promise<StoredFile> {
    const repo = manager ? manager.getRepository(StoredFile) : this.fileRepository;

    const file = await repo.findOne({ where: { id } });

    if (!file) throw new NotFoundException('File not found');
    if (file.status === StoredFileStatus.DELETED) return file;

    if (file.status !== StoredFileStatus.ACTIVE) {
      throw new BadRequestException('Only active files can be marked as deleted');
    }

    file.status = StoredFileStatus.DELETED;
    return await repo.save(file);
  }

  buildPublicFileUrl(id: string) {
    const publicUrl = this.configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true });
    return new URL(`/api/files/${id}`, publicUrl).toString();
  }
}
