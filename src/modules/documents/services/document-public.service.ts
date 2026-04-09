import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordStatus } from '../entities';
import { FilesService } from 'src/modules/files/files.service';
import { FindPublicDocumentsDto } from '../dtos';

@Injectable()
export class DocumentPublicService {
  constructor(
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
  ) {}

  // async findAll(query: FindPublicDocumentsDto) {
  //   const { term, type, year, legalStatus, offset, limit } = query;

  //   const queryBuilder = this.documentRepository.createQueryBuilder('doc');

  //   queryBuilder.where('doc.status = :status', { status: DocumentRecordStatus.PUBLISHED });

  //   if (term) {
  //     const trimmed = term.trim();

  //     if (/^\d+$/.test(trimmed)) {
  //       queryBuilder.andWhere('(doc.correlativeNumber = :num OR LOWER(doc.summary) LIKE LOWER(:term))', {
  //         num: Number(trimmed),
  //         term: `%${trimmed}%`,
  //       });
  //     } else {
  //       queryBuilder.andWhere('LOWER(doc.summary) LIKE LOWER(:term)', { term: `%${trimmed}%` });
  //     }
  //   }

  //   if (type) {
  //     queryBuilder.andWhere('doc.typeId = :typeId', { typeId: type });
  //   }

  //   if (year) {
  //     queryBuilder.andWhere('doc.year = :year', { year });
  //   }

  //   if (legalStatus) {
  //     queryBuilder.andWhere('doc.legalStatus = :legalStatus', { legalStatus });
  //   }

  //   queryBuilder.leftJoinAndSelect('doc.type', 'type');

  //   queryBuilder.orderBy('doc.correlativeNumber', 'DESC');

  //   queryBuilder.skip(offset).take(limit);

  //   const [documents, total] = await queryBuilder.getManyAndCount();

  //   return {
  //     documents: documents.map((doc) => this.mapDocumentToDto(doc)),
  //     total,
  //   };
  // }

  async findAll(query: FindPublicDocumentsDto) {
    const { term, type, year, legalStatus, offset, limit } = query;

    const qb = this.documentRepository.createQueryBuilder('doc');

    console.log(term);

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

    qb.orderBy('doc.correlativeNumber', 'DESC')
      .addOrderBy('doc.suffix', 'DESC', 'NULLS LAST')
      .addOrderBy('doc.year', 'DESC');

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

    return {
      id: doc.id,
      code: `${doc.correlativeNumber}/${doc.year}`,
      summary: doc.summary,
      legalStatus: doc.legalStatus,
      publicationDate: doc.publicationDate,
      promulgationDate: doc.promulgationDate,
      validUntil: doc.validUntil,
      type: doc.type?.name,
      file: {
        url: this.fileService.buildPublicFileUrl(doc.file?.id),
        name: doc.file?.originalName,
        mimeType: doc.file?.mimeType,
        size: doc.file?.sizeBytes,
      },
    };
  }

  async findRecent() {
    const documents = await this.documentRepository.find({
      where: {
        status: DocumentRecordStatus.PUBLISHED,
      },
      relations: {
        type: true,
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

  private mapDocumentToDto(doc: DocumentRecord) {
    const { file, type, ...props } = doc;
    return {
      ...props,
      type: doc.type?.name,
      url: this.fileService.buildPublicFileUrl(doc.fileId),
    };
  }
}
