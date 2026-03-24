import {
  Injectable,
  HttpException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';

import {
  DocumentRecord,
  DocumentRelation,
  DocumentRecordType,
  DocumentRelationType,
  DocumentNumberingMode,
  DocumentLegalStatus,
} from '../entities';
import {
  CreateDocumentDto,
  DocumentRelationDto,
  FindAllDocumentsQueryDto,
  SearchDocumentForRelationDto,
  UpdateDocumentDto,
} from '../dtos';
import { StoredFile, StoredFileStatus } from 'src/modules/files/entities/stored-file.entity';
import { FilesService } from 'src/modules/files/files.service';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
    @InjectRepository(DocumentRelation) private docRelationRepository: Repository<DocumentRelation>,
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
    private dataSource: DataSource,
  ) {}

  async findAll({ limit, offset, term, typeId, year, publicationStatus }: FindAllDocumentsQueryDto) {
    const queryBuilder = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.type', 'type')
      .leftJoinAndSelect('document.file', 'file')
      .take(limit)
      .skip(offset)
      .orderBy('document.year', 'DESC')
      .addOrderBy('document.correlativeNumber', 'DESC');

    if (term?.trim()) {
      const normalizedTerm = term.trim();
      queryBuilder.andWhere(
        new Brackets((qb) => {
          if (/^\d+$/.test(normalizedTerm)) {
            qb.where('document.correlativeNumber = :correlativeNumber', { correlativeNumber: Number(normalizedTerm) });
          } else {
            qb.where('document.title ILIKE :title', { title: `%${normalizedTerm}%` });
          }
        }),
      );
    }

    if (typeId) {
      queryBuilder.andWhere('document.typeId = :typeId', { typeId });
    }

    if (year) {
      queryBuilder.andWhere('document.year = :year', { year });
    }

    if (publicationStatus) {
      queryBuilder.andWhere('document.publicationStatus = :publicationStatus', {
        publicationStatus,
      });
    }

    const [documents, total] = await queryBuilder.getManyAndCount();

    return {
      documents: documents.map((doc) => this.toDto(doc)),
      total,
    };
  }

  async create(dto: CreateDocumentDto) {
    const { typeId, fileId, relations = [], ...rest } = dto;

    const type = await this.documentTypeRepository.findOne({ where: { id: typeId } });
    if (!type) throw new BadRequestException('Invalid document type');

    const file = await this.fileService.findFileOrFail(fileId);
    if (file.status !== StoredFileStatus.PENDING) {
      throw new BadRequestException('Invalid selected file');
    }

    await this.validateRelations(relations);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const createdDocument = manager.create(DocumentRecord, {
          ...rest,
          type,
          file,
          numberingScope: this.buildNumberingScope(type, rest.year),
        });

        await manager.save(createdDocument);

        await this.syncRelations(manager, createdDocument.id, relations);

        await manager.update(StoredFile, fileId, { status: StoredFileStatus.ACTIVE });

        return createdDocument;
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      if (error instanceof QueryFailedError && error['code'] === '23505') {
        throw new ConflictException('Correlative number already exists');
      }

      throw new InternalServerErrorException('Error creating document');
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const { relations = [], typeId, fileId, ...rest } = dto;

    await this.validateRelations(relations);

    if (relations.some((r) => r.targetDocumentId === id)) {
      throw new BadRequestException('A document cannot be related to itself');
    }

    return this.dataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(DocumentRecord);

      const document = await documentRepo.findOne({ where: { id } });
      if (!document) {
        throw new NotFoundException('Document not found');
      }

      if (typeId) {
        const type = await manager.getRepository(DocumentRecordType).findOne({ where: { id: typeId } });
        if (!type) throw new BadRequestException('Invalid document type');
        document.type = type;
        document.numberingScope = this.buildNumberingScope(type, document.year);
      }

      // if (fileId) {

      // }

      // 1. actualizar datos básicos
      const updated = await documentRepo.update(id, { ...rest });

      // 2. sincronizar relaciones
      await this.syncRelations(manager, id, relations);

      return updated;
    });
  }

  async searchRelationCandidates({ term, sourceDocumentId }: SearchDocumentForRelationDto) {
    const normalizedTerm = term.trim();

    const queryBuilder = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.type', 'type')
      .select([
        'document.id',
        'document.title',
        'document.correlativeNumber',
        'document.year',
        'document.publicationDate',
        'document.legalStatus',
        'type.name',
      ])
      .orderBy('document.publicationDate', 'DESC')
      .take(10);

    if (sourceDocumentId) {
      queryBuilder.andWhere('document.id != :currentDocumentId', {
        sourceDocumentId,
      });
    }

    queryBuilder.andWhere(
      new Brackets((qb) => {
        if (/^\d+$/.test(normalizedTerm)) {
          qb.where('document.correlativeNumber = :correlativeNumber', { correlativeNumber: Number(normalizedTerm) });
        } else {
          qb.where('document.title ILIKE :title', { title: `%${normalizedTerm}%` });
        }
      }),
    );

    const documents = await queryBuilder.getMany();

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      correlativeNumber: doc.correlativeNumber,
      year: doc.year,
      code: this.buildCode(doc.correlativeNumber, doc.year),
      publicationDate: doc.publicationDate,
      legalStatus: doc.legalStatus,
      type: {
        id: doc.type.id,
        name: doc.type.name,
      },
    }));
  }

  async findOutgoingRelationsByDocumentId(id: string) {
    const relations = await this.docRelationRepository.find({
      where: {
        sourceDocumentId: id,
      },
      relations: {
        targetDocument: {
          type: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });
    return relations.map((rel) => ({
      id: rel.id,
      relationType: rel.relationType,
      targetDocument: {
        id: rel.targetDocument.id,
        title: rel.targetDocument.title,
        type: rel.targetDocument.type.name,
        code: this.buildCode(rel.targetDocument.correlativeNumber, rel.targetDocument.year),
      },
    }));
  }

  private toDto(doc: DocumentRecord) {
    const { file, ...rest } = doc;
    return {
      ...rest,
      code: this.buildCode(rest.correlativeNumber, rest.year),
      file: {
        url: this.fileService.buildPublicFileUrl(file.id),
        name: file.originalName,
        size: file.sizeBytes,
      },
    };
  }

  private buildCode(correlativeNumber: number, year: number) {
    return `${correlativeNumber.toString().padStart(3, '0')}/${year}`;
  }

  private buildNumberingScope(type: DocumentRecordType, year: number): string {
    return type.numberingMode === DocumentNumberingMode.GLOBAL ? 'GLOBAL' : String(year);
  }

  private async syncRelations(manager: EntityManager, sourceId: string, incomingRelations: DocumentRelationDto[]) {
    const relationRepo = manager.getRepository(DocumentRelation);
    const documentRepo = manager.getRepository(DocumentRecord);

    const existingRelations = await relationRepo.find({ where: { sourceDocumentId: sourceId } });

    const existingMap = new Map(existingRelations.map((r) => [r.targetDocumentId, r]));
    const incomingMap = new Map(incomingRelations.map((r) => [r.targetDocumentId, r]));

    const toDelete = existingRelations.filter((r) => !incomingMap.has(r.targetDocumentId));

    const toCreate = incomingRelations.filter((r) => !existingMap.has(r.targetDocumentId));

    const toUpdate = existingRelations.filter((r) => {
      const incoming = incomingMap.get(r.targetDocumentId);
      return incoming && incoming.type !== r.relationType;
    });

    // deletes
    for (const rel of toDelete) {
      await relationRepo.delete(rel.id);
      await documentRepo.update(rel.targetDocumentId, { legalStatus: DocumentLegalStatus.VALID });
    }

    // updates
    for (const rel of toUpdate) {
      const incoming = incomingMap.get(rel.targetDocumentId);
      if (!incoming) continue;
      await relationRepo.update(rel.id, { relationType: incoming.type });
      await this.applyRelationEffect(manager, rel.targetDocumentId, incoming.type);
    }

    // creates
    for (const rel of toCreate) {
      const newRelation = relationRepo.create({
        sourceDocumentId: sourceId,
        targetDocumentId: rel.targetDocumentId,
        relationType: rel.type,
      });
      await relationRepo.save(newRelation);
      await this.applyRelationEffect(manager, rel.targetDocumentId, rel.type);
    }
  }

  private async validateRelations(relations: DocumentRelationDto[]) {
    if (!relations.length) return;

    const seen = new Set<string>();

    for (const rel of relations) {
      if (seen.has(rel.targetDocumentId)) {
        throw new BadRequestException('A target document cannot be selected more than once.');
      }
      seen.add(rel.targetDocumentId);
    }

    const ids = relations.map((r) => r.targetDocumentId);

    const count = await this.documentRepository.count({ where: { id: In(ids) } });

    if (count !== ids.length) {
      throw new BadRequestException('Some target documents do not exist.');
    }
  }

  private async applyRelationEffect(manager: EntityManager, targetId: string, type: DocumentRelationType) {
    const status = this.resolveTargetLegalStatus(type);
    if (status) {
      await manager.update(DocumentRecord, { id: targetId }, { legalStatus: status });
    }
  }

  private resolveTargetLegalStatus(relationType: DocumentRelationType) {
    switch (relationType) {
      case DocumentRelationType.MODIFIES:
        return DocumentLegalStatus.MODIFIED;

      case DocumentRelationType.ABROGATES:
        return DocumentLegalStatus.ABROGATED;

      case DocumentRelationType.DEROGATES:
        return DocumentLegalStatus.DEROGATED;

      case DocumentRelationType.REFERENCES:
      case DocumentRelationType.REGULATES:
      case DocumentRelationType.RECTIFIES:
        return null;
    }
  }
}
