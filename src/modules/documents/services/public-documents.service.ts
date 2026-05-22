import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { Brackets, Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordStatus, DocumentRecordType } from '../entities';
import { FilesService } from 'src/modules/files/files.service';
import { EnvironmentVariables } from 'src/config';
import { FindPublicDocumentsDto } from '../dtos';

@Injectable()
export class PublicDocumentsService {
  constructor(
    @InjectRepository(DocumentRecordType) private docTypeRespository: Repository<DocumentRecordType>,
    @InjectRepository(DocumentRecord) private docRepository: Repository<DocumentRecord>,
    private configService: ConfigService<EnvironmentVariables>,
    private fileService: FilesService,
  ) {}

  async findAll(query: FindPublicDocumentsDto) {
    const { term, type, year, legalStatus, offset, limit } = query;

    const qb = this.docRepository.createQueryBuilder('doc');

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

  async getPublicDocumentDetail(id: string) {
    const doc = await this.docRepository.findOne({
      where: { id, status: DocumentRecordStatus.PUBLISHED },
      relations: {
        type: true,
        file: true,
        outgoingRelations: {
          targetDocument: {
            type: true,
          },
        },
        incomingRelation: {
          sourceDocument: {
            type: true,
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException(`Document with ID ${id} not found or not published.`);
    }

    return this.mapDocumentDetailToDto(doc);
  }

  async getPublicDocumentFileStream(documentId: string, options?: { countDownload?: boolean }) {
    const document = await this.docRepository.findOne({
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
    await this.docRepository.increment({ id }, 'downloadCount', 1);
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
    const url = new URL(`/public-documents/${documentId}/file`, baseUrl);
    return url.toString();
  }

  async getLandingData() {
    const currentYear = new Date().getFullYear();

    const [documentTypes, recentDocuments, featuredDocuments, stats] = await Promise.all([
      this.getPublicDocumentTypes(),
      this.getRecentDocuments(6),
      this.getFeaturedDocuments(6),
      this.getLandingStats(currentYear),
    ]);

    return {
      documentTypes,
      recentDocuments,
      featuredDocuments,
      stats,
    };
  }

  private async getPublicDocumentTypes() {
    const types: object = await this.docTypeRespository
      .createQueryBuilder('type')
      .leftJoin('type.documents', 'document', 'document.status = :status', {
        status: DocumentRecordStatus.PUBLISHED,
      })
      .select([
        'type.id AS id',
        'type.name AS name',
        'type.description AS description',
        'COUNT(document.id)::int AS "documentsCount"',
      ])
      .where('type.isActive = :isActive', { isActive: true })
      .groupBy('type.id')
      .orderBy('type.name', 'ASC')
      .getRawMany();

    return types;
  }

  private async getRecentDocuments(limit: number) {
    const docs = await this.docRepository.find({
      where: {
        status: DocumentRecordStatus.PUBLISHED,
      },
      relations: {
        type: true,
      },
      order: {
        publicationDate: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });

    return docs.map((doc) => this.toPublicDocumentCard(doc));
  }

  private async getFeaturedDocuments(limit: number) {
    const docs = await this.docRepository.find({
      where: {
        status: DocumentRecordStatus.PUBLISHED,
        isFeatured: true,
      },
      relations: {
        type: true,
      },
      order: {
        publicationDate: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });

    return docs.map((doc) => this.toPublicDocumentCard(doc));
  }

  private async getLandingStats(currentYear: number) {
    const [totalPublishedDocuments, documentTypesCount, yearRange, currentYearPublications] = await Promise.all([
      this.docRepository.count({
        where: {
          status: DocumentRecordStatus.PUBLISHED,
        },
      }),

      this.docTypeRespository.count({
        where: {
          isActive: true,
        },
      }),

      this.docRepository
        .createQueryBuilder('document')
        .select('MIN(document.year)', 'minYear')
        .addSelect('MAX(document.year)', 'maxYear')
        .where('document.status = :status', {
          status: DocumentRecordStatus.PUBLISHED,
        })
        .getRawOne<{ minYear: number | null; maxYear: number | null }>(),

      this.docRepository.count({
        where: {
          status: DocumentRecordStatus.PUBLISHED,
          year: currentYear,
        },
      }),
    ]);

    return {
      totalPublishedDocuments,
      documentTypesCount,
      currentYearPublications,
      currentYear,
      availableYears: {
        min: yearRange?.minYear ?? null,
        max: yearRange?.maxYear ?? null,
      },
    };
  }

  private toPublicDocumentCard(doc: DocumentRecord) {
    return {
      id: doc.id,
      code: doc.code,
      summary: doc.summary,
      typeName: doc.type?.name,
      year: doc.year,
      publicationDate: doc.publicationDate,
      legalStatus: doc.legalStatus,
    };
  }

  private mapDocumentDetailToDto(doc: DocumentRecord) {
    const { type, file, outgoingRelations, incomingRelation, ...props } = doc;

    return {
      id: props.id,
      code: props.code,
      summary: props.summary,
      validUntil: props.validUntil,
      legalStatus: props.legalStatus,
      downloadCount: props.downloadCount,
      publicationDate: props.publicationDate,
      promulgationDate: props.promulgationDate,

      typeName: type.name,

      file: file
        ? {
            url: this.buildPublicDocumentFileUrl(doc.id),
            downloadUrl: this.buildPublicDocumentFileUrl(doc.id),
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          }
        : null,

      relations: {
        outgoing:
          outgoingRelations?.map((relation) => ({
            relationType: relation.type,
            note: relation.note,
            document: this.mapRelatedDocumentToDto(relation.targetDocument),
          })) ?? [],

        incoming: incomingRelation
          ? {
              relationType: incomingRelation.type,
              note: incomingRelation.note,
              document: this.mapRelatedDocumentToDto(incomingRelation.sourceDocument),
            }
          : null,
      },
    };
  }

  private mapRelatedDocumentToDto(doc: DocumentRecord) {
    return {
      id: doc.id,
      code: doc.code,
      typeName: doc.type.name,
      legalStatus: doc.legalStatus,
    };
  }
}
