import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import {
  DocumentRecord,
  DocumentRelation,
  DocumentLegalStatus,
  DocumentRecordStatus,
  DocumentRelationType,
} from '../entities';
import { SearchRelationCandidatesDto, SaveDocumentRelationDto } from '../dtos';

const RELATION_TYPE_TO_LEGAL_STATUS: Record<DocumentRelationType, DocumentLegalStatus> = {
  [DocumentRelationType.MODIFIES]: DocumentLegalStatus.MODIFIED,
  [DocumentRelationType.ABROGATES]: DocumentLegalStatus.ABROGATED,
  [DocumentRelationType.DEROGATES]: DocumentLegalStatus.DEROGATED,
};

@Injectable()
export class DocumentRelationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DocumentRecord) private docRepository: Repository<DocumentRecord>,
    @InjectRepository(DocumentRelation) private relationRepository: Repository<DocumentRelation>,
  ) {}

  async save(targetId: string, dto: SaveDocumentRelationDto) {
    return this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(DocumentRecord, {
        where: { id: targetId },
        relations: { type: true },
        select: { type: { id: true, name: true } },
      });

      if (!target) {
        throw new NotFoundException('Document not found');
      }

      const source = await manager.findOne(DocumentRecord, {
        where: { id: dto.sourceDocumentId },
        relations: { type: true },
        select: { type: { id: true, name: true } },
      });

      if (!source) {
        throw new BadRequestException('Invalid source document');
      }

      if (source.id === target.id) {
        throw new BadRequestException('A document cannot be related to itself');
      }

      let relation = await manager.findOne(DocumentRelation, {
        where: { targetDocumentId: target.id },
      });

      if (!relation) {
        relation = manager.create(DocumentRelation, {
          targetDocument: target,
        });
      }

      relation.sourceDocument = source;
      relation.type = dto.type;
      relation.note = dto.note ?? null;

      await manager.save(relation);

      target.legalStatus = RELATION_TYPE_TO_LEGAL_STATUS[dto.type];

      await manager.save(target);

      return { message: 'Relation saved successfully', targetLegalStatus: target.legalStatus };
    });
  }

  async remove(targetDocumentId: string) {
    return this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(DocumentRecord, {
        where: { id: targetDocumentId },
      });

      if (!target) {
        throw new NotFoundException('Document not found');
      }

      const relation = await manager.findOne(DocumentRelation, {
        where: { targetDocumentId: target.id },
      });

      if (!relation) {
        throw new NotFoundException('This document does not have a legal relation');
      }

      await manager.remove(relation);

      target.legalStatus = DocumentLegalStatus.VALID;
      await manager.save(target);

      return { message: 'Relation removed successfully', targetLegalStatus: target.legalStatus };
    });
  }
  
  async findByTarget(targetId: string) {
    const relation = await this.relationRepository
      .createQueryBuilder('relation')
      .innerJoin('relation.sourceDocument', 'source')
      .innerJoin('source.type', 'sourceType')
      .select([
        'relation.id',
        'relation.type',
        'relation.note',
        'source.id',
        'source.code',
        'source.summary',
        'sourceType.id',
        'sourceType.name',
      ])
      .where('relation.targetDocumentId = :targetId', { targetId })
      .getOne();

    return relation ? this.toDto(relation) : null;
  }

  async findCandidates(query: SearchRelationCandidatesDto) {
    const search = `%${query.term}%`;

    const queryBuilder = this.docRepository
      .createQueryBuilder('document')
      .innerJoin('document.type', 'type')
      .select([
        'document.id',
        'document.code',
        'document.summary',
        'document.year',
        'document.legalStatus',
        'document.correlativeNumber',
        'type.id',
        'type.name',
      ])
      .where('document.status = :status', {
        status: DocumentRecordStatus.PUBLISHED,
      })
      .andWhere(
        `
          (
            document.code ILIKE :search
            OR document.summary ILIKE :search
            OR type.name ILIKE :search
            OR CONCAT(type.name, ' ', document.code) ILIKE :search
          )
        `,
        { search },
      );

    if (query.excludeDocumentId) {
      queryBuilder.andWhere('document.id != :excludeDocumentId', { excludeDocumentId: query.excludeDocumentId });
    }

    const documents = await queryBuilder
      .orderBy('document.year', 'DESC')
      .addOrderBy('document.correlativeNumber', 'DESC')
      .take(10)
      .getMany();

    return documents.map((document) => ({
      id: document.id,
      code: document.code,
      summary: document.summary,
      typeName: document.type.name,
    }));
  }

  private toDto(relation: DocumentRelation) {
    return {
      id: relation.id,
      type: relation.type,
      note: relation.note,
      sourceDocument: {
        id: relation.sourceDocument.id,
        code: relation.sourceDocument.code,
        typeName: relation.sourceDocument.type.name,
        summary: relation.sourceDocument.summary,
      },
    };
  }
}
