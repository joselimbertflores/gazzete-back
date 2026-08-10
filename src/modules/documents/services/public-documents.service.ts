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
    private configService: ConfigService<EnvironmentVariables, true>,
    private fileService: FilesService,
  ) {}

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

  async findAll(query: FindPublicDocumentsDto) {
    const { term, type, year, legalStatus, offset, limit } = query;

    const qb = this.docRepository.createQueryBuilder('doc');

    qb.where('doc.status = :status', {
      status: DocumentRecordStatus.PUBLISHED,
    });

    qb.leftJoinAndSelect('doc.type', 'type');
    qb.leftJoinAndSelect('doc.file', 'file');

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
      qb.andWhere('type.slug = :type', { type });
    }

    if (year) {
      qb.andWhere('doc.year = :year', { year });
    }

    if (legalStatus) {
      qb.andWhere('doc.legalStatus = :legalStatus', { legalStatus });
    }

    qb.leftJoin('doc.incomingRelation', 'incomingRelation');
    qb.leftJoin('incomingRelation.sourceDocument', 'sourceDocument', 'sourceDocument.status = :publishedStatus', {
      publishedStatus: DocumentRecordStatus.PUBLISHED,
    });
    qb.leftJoin('sourceDocument.type', 'sourceDocumentType');
    qb.addSelect([
      'incomingRelation.type',
      'incomingRelation.note',
      'sourceDocument.id',
      'sourceDocument.slug',
      'sourceDocument.code',
      'sourceDocumentType.name',
    ]);

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

  async getDocumentDetail(slug: string) {
    const doc = await this.docRepository.findOne({
      where: { slug, status: DocumentRecordStatus.PUBLISHED },
      relations: {
        type: true,
        file: true,
        outgoingRelations: { targetDocument: { type: true } },
        incomingRelation: { sourceDocument: { type: true } },
      },
    });

    if (!doc) {
      throw new NotFoundException(`Document with slug ${slug} not found or not published.`);
    }

    const { type, file, outgoingRelations, incomingRelation, ...props } = doc;

    return {
      id: props.id,
      slug: props.slug,
      code: props.code,
      summary: props.summary,
      validUntil: props.validUntil,
      legalStatus: props.legalStatus,
      downloadCount: props.downloadCount,
      publicationDate: props.publicationDate,
      promulgationDate: props.promulgationDate,
      typeName: type.name,
      file: {
        url: this.buildPublicDocumentFileUrl(doc.id),
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
      relations: {
        outgoing: outgoingRelations.map((relation) => ({
          relationType: relation.type,
          note: relation.note,
          document: {
            id: relation.targetDocument.id,
            slug: relation.targetDocument.slug,
            code: relation.targetDocument.code,
            summary: relation.targetDocument.summary,
            typeName: relation.targetDocument.type.name,
          },
        })),
        incoming: incomingRelation
          ? {
              relationType: incomingRelation.type,
              note: incomingRelation.note,
              document: {
                id: incomingRelation.sourceDocument.id,
                slug: incomingRelation.sourceDocument.slug,
                code: incomingRelation.sourceDocument.code,
                summary: incomingRelation.sourceDocument.summary,
                typeName: incomingRelation.sourceDocument.type.name,
              },
            }
          : null,
      },
    };
  }

  getSitemapDocuments() {
    return this.docRepository
      .createQueryBuilder('document')
      .select('document.slug', 'slug')
      .addSelect('document.updatedAt', 'updatedAt')
      .where('document.status = :status', { status: DocumentRecordStatus.PUBLISHED })
      .andWhere('document.slug IS NOT NULL')
      .andWhere("document.slug <> ''")
      .orderBy('document.slug', 'ASC')
      .getRawMany<{ slug: string; updatedAt: Date | string }>();
  }

  async incrementDownloadCount(id: string) {
    await this.docRepository.increment({ id }, 'downloadCount', 1);
  }

  async getLandingData() {
    const currentYear = new Date().getFullYear();

    const [documentTypes, recentDocuments, featuredDocuments, stats] = await Promise.all([
      this.getPublicDocumentTypes(),
      this.getRecentDocuments(8),
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

  getTypeOptions() {
    return this.docTypeRespository
      .createQueryBuilder('type')
      .select(['type.name AS name', 'type.slug AS slug'])
      .where('type.isActive = :isActive', { isActive: true })
      .andWhere('type.slug IS NOT NULL')
      .orderBy('type.name', 'ASC')
      .getRawMany<{ name: string; slug: string }>();
  }

  private async getPublicDocumentTypes() {
    const types: object = await this.docTypeRespository
      .createQueryBuilder('type')
      .leftJoin('type.documents', 'document', 'document.status = :status', {
        status: DocumentRecordStatus.PUBLISHED,
      })
      .select([
        'type.name AS name',
        'type.slug AS slug',
        'type.description AS description',
        'COUNT(document.id)::int AS "documentsCount"',
      ])
      .where('type.isActive = :isActive', { isActive: true })
      .andWhere('type.slug IS NOT NULL')
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

  private buildPublicDocumentFileUrl(documentId: string) {
    const baseUrl = this.configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true });
    const url = new URL(`/public-documents/${documentId}/file`, baseUrl);
    return url.toString();
  }

  private toPublicDocumentCard(doc: DocumentRecord) {
    return {
      id: doc.id,
      slug: doc.slug,
      code: doc.code,
      summary: doc.summary,
      typeName: doc.type?.name,
      year: doc.year,
      publicationDate: doc.publicationDate,
      legalStatus: doc.legalStatus,
    };
  }

  private mapDocumentToDto(doc: DocumentRecord) {
    return {
      id: doc.id,
      slug: doc.slug,
      code: doc.code,
      summary: doc.summary,
      legalStatus: doc.legalStatus,
      publicationDate: doc.publicationDate,
      promulgationDate: doc.promulgationDate,
      validUntil: doc.validUntil,
      downloadCount: doc.downloadCount,
      typeName: doc.type.name,
      file: {
        url: this.buildPublicDocumentFileUrl(doc.id),
        name: doc.file.originalName,
        mimeType: doc.file.mimeType,
        sizeBytes: doc.file.sizeBytes,
      },
      incomingRelation: doc.incomingRelation?.sourceDocument
        ? {
            relationType: doc.incomingRelation.type,
            note: doc.incomingRelation.note,
            document: {
              id: doc.incomingRelation.sourceDocument.id,
              slug: doc.incomingRelation.sourceDocument.slug,
              code: doc.incomingRelation.sourceDocument.code,
              typeName: doc.incomingRelation.sourceDocument.type.name,
            },
          }
        : null,
    };
  }
}
