import {
  Injectable,
  HttpException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, DataSource, In, QueryFailedError, Repository } from 'typeorm';

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
} from '../dtos';
import { StoredFile, StoredFileStatus } from 'src/modules/files/entities/stored-file.entity';
import { FilesService } from 'src/modules/files/files.service';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
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
      .orderBy('document.publicationDate', 'DESC')
      .addOrderBy('document.createdAt', 'DESC');

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
    const { typeId, fileId, relationReferences = [], ...rest } = dto;
    const { type, file, relations } = await this.validateDtoReferences(typeId, fileId, relationReferences);
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Create document
        const createdDocument = manager.create(DocumentRecord, {
          type,
          file,
          numberingScope: this.buildNumberingScope(type, rest.year),
          ...rest,
        });
        await manager.save(createdDocument);

        if (relationReferences.length) {
          // Create relations
          const relationModels = relations.map(({ targetDocument, relationType }) =>
            manager.create(DocumentRelation, { sourceDocument: createdDocument, targetDocument, relationType }),
          );
          await manager.save(relationModels);

          // Update status of target documents
          for (const { targetDocument, relationType } of relations) {
            const legalStatus = this.resolveTargetLegalStatus(relationType);
            if (!legalStatus) continue;
            await manager.update(DocumentRecord, { id: targetDocument.id }, { legalStatus });
          }
        }

        // Activate stored file
        await manager.update(StoredFile, dto.fileId, { status: StoredFileStatus.ACTIVE });

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

  private async validateDtoReferences(typeId: number, fileId: string, relationReferences: DocumentRelationDto[]) {
    const type = await this.documentTypeRepository.findOne({ where: { id: typeId } });
    if (!type) throw new BadRequestException('Invalid document type');

    const file = await this.fileService.findFileOrFail(fileId);
    if (file.status !== StoredFileStatus.PENDING) throw new BadRequestException('Invalid selected file');

    if (relationReferences.length === 0) return { type, file, relations: [] };

    const seenTargetIds = new Set<string>();

    for (const relation of relationReferences) {
      if (seenTargetIds.has(relation.targetDocumentId)) {
        throw new BadRequestException('A target document cannot be selected more than once.');
      }
      seenTargetIds.add(relation.targetDocumentId);
    }

    const ids = relationReferences.map(({ targetDocumentId }) => targetDocumentId);

    const documents = await this.documentRepository.find({
      where: { id: In(ids) },
      select: {
        id: true,
        title: true,
        summary: true,
        legalStatus: true,
      },
    });

    if (documents.length !== ids.length) {
      throw new BadRequestException('Invalid target document. Some documents do not exist.');
    }

    const documentsMap = new Map(documents.map((doc) => [doc.id, doc]));

    const relations = relationReferences.map(({ type, targetDocumentId }) => {
      const targetDocument = documentsMap.get(targetDocumentId);
      if (!targetDocument) throw new BadRequestException(`Target ${targetDocumentId} does not exist.`);
      return { targetDocument, relationType: type };
    });
    return { type, file, relations };
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
