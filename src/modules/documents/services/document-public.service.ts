import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordStatus } from '../entities';
import { FilesService } from 'src/modules/files/files.service';
import { FindPublicDocumentsDto } from '../dtos';

@Injectable()
export class DocumentPublicService {
  constructor(
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
  ) {}

  async findAll(query: FindPublicDocumentsDto) {
    const { term, typeId, year, legalStatus, offset, limit } = query;

    const queryBuilder = this.documentRepository.createQueryBuilder('doc');

    queryBuilder.where('doc.status = :status', { status: DocumentRecordStatus.PUBLISHED });

    if (term) {
      const trimmed = term.trim();

      if (/^\d+$/.test(trimmed)) {
        queryBuilder.andWhere('(doc.correlativeNumber = :num OR LOWER(doc.summary) LIKE LOWER(:term))', {
          num: Number(trimmed),
          term: `%${trimmed}%`,
        });
      } else {
        queryBuilder.andWhere('LOWER(doc.summary) LIKE LOWER(:term)', { term: `%${trimmed}%` });
      }
    }

    if (typeId) {
      queryBuilder.andWhere('doc.typeId = :typeId', { typeId });
    }

    if (year) {
      queryBuilder.andWhere('doc.year = :year', { year });
    }

    if (legalStatus) {
      queryBuilder.andWhere('doc.legalStatus = :legalStatus', { legalStatus });
    }

    queryBuilder.leftJoinAndSelect('doc.type', 'type');

    queryBuilder.orderBy('doc.correlativeNumber', 'DESC');

    queryBuilder.skip(offset).take(limit);

    const [documents, total] = await queryBuilder.getManyAndCount();

    console.log({ limit, offset });

    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        code: `${doc.correlativeNumber.toString().padStart(3, '0')}/${doc.year}`,
        summary: doc.summary,
        legalStatus: doc.legalStatus,
        publicationDate: doc.publicationDate,
        promulgationDate: doc.promulgationDate,
        validUntil: doc.validUntil,
        type: doc.type?.name,
        url: this.fileService.buildPublicFileUrl(doc.fileId),
      })),
      total,
    };
  }
}
