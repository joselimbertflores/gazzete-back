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
  UpdateDocumentDto,
  CreateDocumentDto,
  DocumentRelationDto,
  FindAllDocumentsQueryDto,
  SearchDocumentForRelationDto,
} from '../dtos';
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
    try {
      return this.dataSource.transaction(async (manager) => {
        const type = await manager.findOneBy(DocumentRecordType, { id: typeId });
        if (!type) throw new BadRequestException('Invalid document type');

        const file = await this.fileService.getPendingFileOrFail(fileId, manager);

        const document = manager.create(DocumentRecord, {
          ...rest,
          type,
          file,
          numberingScope: this.buildNumberingScope(type, rest.year),
        });

        const saved = await manager.save(document);

        await this.fileService.markAsActive(file.id, manager);

        return saved;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof QueryFailedError && error['code'] === '23505') {
        throw new ConflictException('Correlative number already exists');
      }
      throw new InternalServerErrorException('Error creating document');
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const { typeId, fileId, relations = [], ...rest } = dto;

    try {
      return this.dataSource.transaction(async (manager) => {
        const document = await manager.findOne(DocumentRecord, { where: { id } });
        if (!document) throw new NotFoundException('Document not found');

        if (typeId) {
          const type = await manager.findOne(DocumentRecordType, { where: { id: typeId } });
          if (!type) throw new BadRequestException('Invalid document type');
          document.type = type;
          document.numberingScope = this.buildNumberingScope(type, document.year);
        }

        if (fileId && fileId !== document.file.id) {
          const newFile = await this.fileService.getPendingFileOrFail(fileId, manager);

          const oldFile = document.file;

          document.file = newFile;

          await this.fileService.markAsActive(newFile.id, manager);
          await this.fileService.markAsDeleted(oldFile.id, manager);
        }
        Object.assign(document, rest);
        return await manager.save(document);
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
