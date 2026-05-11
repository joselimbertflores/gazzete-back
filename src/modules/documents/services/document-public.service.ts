import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { Brackets, Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordStatus } from '../entities';
import { FilesService } from 'src/modules/files/files.service';
import { EnvironmentVariables } from 'src/config';
import { FindPublicDocumentsDto } from '../dtos';

@Injectable()
export class DocumentPublicService {
  constructor(
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
    private configService: ConfigService<EnvironmentVariables>,
  ) {}

  async findAll(query: FindPublicDocumentsDto) {
    const { term, type, year, legalStatus, offset, limit } = query;

    const qb = this.documentRepository.createQueryBuilder('doc');

    qb.where('doc.status = :status', { status: DocumentRecordStatus.PUBLISHED });

    if (term?.trim()) {
      const normalizedTerm = term.trim();

      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('doc.code ILIKE :term', { term: `%${normalizedTerm}%` })
            .orWhere('doc.summary ILIKE :term', { term: `%${normalizedTerm}%` });
        }),
      );
    }

    if (type) {
      qb.andWhere('doc.typeId = :typeId', { typeId: type });
    }

    if (year) {
      qb.andWhere('doc.year = :year', { year });
    }

    if (legalStatus) {
      qb.andWhere('doc.legalStatus = :legalStatus', { legalStatus });
    }

    qb.leftJoinAndSelect('doc.type', 'type');
    qb.leftJoinAndSelect('doc.file', 'file');

    qb.orderBy('doc.year', 'DESC')
      .addOrderBy('doc.correlativeNumber', 'DESC')
      .addOrderBy('doc.suffix', 'DESC', 'NULLS LAST');

    qb.skip(offset).take(limit);

    const [documents, total] = await qb.getManyAndCount();

    return {
      documents: documents.map((doc) => this.mapDocumentToDto(doc)),
      total,
    };
  }

  async findOne(id: string) {
    const doc = await this.documentRepository.findOne({
      where: { id, status: DocumentRecordStatus.PUBLISHED },
      relations: { type: true, file: true },
    });

    if (!doc) {
      throw new NotFoundException(`Document with ID ${id} not found or not published.`);
    }
    return this.mapDocumentToDto(doc);
  }

  async findRecent() {
    const documents = await this.documentRepository.find({
      where: {
        status: DocumentRecordStatus.PUBLISHED,
      },
      relations: {
        type: true,
        file: true,
      },
      order: {
        year: 'DESC',
        correlativeNumber: 'DESC',
        createdAt: 'DESC',
      },
      take: 10,
    });

    return documents.map((doc) => this.mapDocumentToDto(doc));
  }

  async getPublicDocumentFileStream(documentId: string, options?: { countDownload?: boolean }) {
    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        status: DocumentRecordStatus.PUBLISHED,
      },
      relations: {
        file: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const result = await this.fileService.getFileStream(document.file.id);

    if (options?.countDownload) {
      await this.incrementDownloadCount(document.id);
    }
    return result;
  }

  async incrementDownloadCount(id: string) {
    await this.documentRepository.increment({ id }, 'downloadCount', 1);
  }

  private mapDocumentToDto(doc: DocumentRecord) {
    return {
      id: doc.id,
      code: doc.code,
      summary: doc.summary,
      legalStatus: doc.legalStatus,
      publicationDate: doc.publicationDate,
      promulgationDate: doc.promulgationDate,
      validUntil: doc.validUntil,
      downloadCount: doc.downloadCount,
      type: doc.type.name,
      file: {
        url: this.buildPublicDocumentFileUrl(doc.id),
        name: doc.file.originalName,
        mimeType: doc.file.mimeType,
        sizeBytes: doc.file.sizeBytes,
      },
    };
  }

  private buildPublicDocumentFileUrl(documentId: string) {
    const baseUrl = this.configService.getOrThrow<string>('HOST');
    const url = new URL(`/api/documents-public/${documentId}/file`, baseUrl);
    return url.toString();
  }
}
