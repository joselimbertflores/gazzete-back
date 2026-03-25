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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const type = await queryRunner.manager.findOneBy(DocumentRecordType, { id: typeId });
      if (!type) throw new BadRequestException('Invalid document type');

      const file = await queryRunner.manager.findOneBy(StoredFile, { id: fileId });
      if (!file || file.status !== StoredFileStatus.PENDING) throw new BadRequestException('Invalid selected file');

      const entity = queryRunner.manager.create(DocumentRecord, {
        ...rest,
        type,
        file,
        numberingScope: this.buildNumberingScope(type, rest.year),
      });
      const createdDocument = await queryRunner.manager.save(entity);

      await this.syncRelations(queryRunner.manager, createdDocument.id, relations);

      await queryRunner.manager.update(StoredFile, fileId, { status: StoredFileStatus.ACTIVE });
      await queryRunner.commitTransaction();

      return createdDocument;
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof HttpException) throw error;

      if (error instanceof QueryFailedError && error['code'] === '23505') {
        throw new ConflictException('Correlative number already exists');
      }

      throw new InternalServerErrorException('Error creating document');
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const { relations = [], typeId, fileId, ...rest } = dto;

    if (relations.some((r) => r.targetDocumentId === id)) {
      throw new BadRequestException('A document cannot be related to itself');
    }

    try {
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
    } catch (error) {
      console.log('test');
    }
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

  private async syncRelations(manager: EntityManager, sourceId: string, relations: DocumentRelationDto[]) {
    const targetIds = relations.map((r) => r.targetDocumentId);

    if (new Set(targetIds).size !== targetIds.length) {
      throw new BadRequestException('Un documento no puede ser elegido más de una vez.');
    }

    if (targetIds.includes(sourceId)) {
      throw new BadRequestException('Un documento no puede relacionarse consigo mismo.');
    }

    const count = await manager.count(DocumentRecord, { where: { id: In(targetIds) } });

    if (count !== targetIds.length) throw new BadRequestException('Algunos documentos destino no existen.');

    const existingRelations = await manager.find(DocumentRelation, { where: { sourceDocumentId: sourceId } });

    const existingMap = new Map(existingRelations.map((r) => [r.targetDocumentId, r]));
    const incomingMap = new Map(relations.map((r) => [r.targetDocumentId, r]));

    const toDelete = existingRelations.filter((r) => !incomingMap.has(r.targetDocumentId));

    const toCreate = relations.filter((r) => !existingMap.has(r.targetDocumentId));

    const toUpdate = existingRelations.filter((r) => {
      const incoming = incomingMap.get(r.targetDocumentId);
      return incoming && incoming.type !== r.relationType;
    });

    const affectedIds = new Set<string>();

    if (toDelete.length) {
      await manager.delete(
        DocumentRelation,
        toDelete.map(({ id }) => id),
      );
      toDelete.forEach((r) => affectedIds.add(r.targetDocumentId));
    }

    for (const rel of toUpdate) {
      const incoming = incomingMap.get(rel.targetDocumentId);

      if (!incoming) continue;

      await manager.update(DocumentRelation, rel.id, { relationType: incoming.type });
      affectedIds.add(rel.targetDocumentId);
    }

    if (toCreate.length) {
      const entities = toCreate.map((r) =>
        manager.create(DocumentRelation, {
          sourceDocumentId: sourceId,
          targetDocumentId: r.targetDocumentId,
          relationType: r.type,
        }),
      );

      await manager.save(entities);

      toCreate.forEach((r) => affectedIds.add(r.targetDocumentId));
    }

    for (const id of affectedIds) {
      await this.recomputeLegalStatus(manager, id);
    }
  }

  private async recomputeLegalStatus(manager: EntityManager, targetId: string) {
    const relations = await manager.find(DocumentRelation, { where: { targetDocumentId: targetId } });

    const types = relations.map((r) => r.relationType);

    let status = DocumentLegalStatus.VALID;

    // * ABROGATED > DEROGATED > MODIFIED > VALID

    if (types.includes(DocumentRelationType.ABROGATES)) {
      status = DocumentLegalStatus.ABROGATED;
    } else if (types.includes(DocumentRelationType.DEROGATES)) {
      status = DocumentLegalStatus.DEROGATED;
    } else if (types.includes(DocumentRelationType.MODIFIES)) {
      status = DocumentLegalStatus.MODIFIED;
    }
    await manager.update(DocumentRecord, { id: targetId }, { legalStatus: status });
  }
}
