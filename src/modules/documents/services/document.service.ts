import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, DataSource, ILike, In, QueryFailedError, Repository } from 'typeorm';

import {
  DocumentNumberingMode,
  DocumentRecord,
  DocumentRecordType,
  DocumentRelation,
  DocumentRelationType,
} from '../entities';
import {
  CreateDocumentDto,
  DocumentRelationDto,
  FindAllDocumentsQueryDto,
  SearchDocumentForRelationDto,
} from '../dtos';
import { StoredFile, StoredFileStatus } from 'src/modules/files/entities/stored-file.entity';
import { FilesService } from 'src/modules/files/files.service';
import { PaginationParamsDto } from 'src/modules/common';

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
    const { typeId, fileId, relations = [], ...rest } = dto;
    const validProps = await this.validateDocumentRelations(typeId, fileId, relations);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const createdDocument = manager.create(DocumentRecord, {
          type: validProps.type,
          file: validProps.file,
          numberingScope: this.buildNumberingScope(validProps.type, rest.year),
          ...rest,
        });
        await manager.save(createdDocument);
        if (relations.length) {
          await manager.save(
            validProps.relations.map(({ targetDocument, relationType }) =>
              manager.create(DocumentRelation, {
                sourceDocument: createdDocument,
                targetDocument,
                relationType,
              }),
            ),
          );
        }
        await manager.update(StoredFile, dto.fileId, { status: StoredFileStatus.ACTIVE });
        return createdDocument;
      });
    } catch (error: unknown) {
      if (error instanceof QueryFailedError && error['code'] === '23505') {
        throw new ConflictException('Ya existe un documento con ese tipo, correlativo y alcance de numeración.');
      }
      throw new InternalServerErrorException('No se pudo crear el documento.');
    }
  }

  async searchForRelation(dto: SearchDocumentForRelationDto) {
    const { sourceDocumentId, term } = dto;

    const qb = this.documentRepository.createQueryBuilder('doc');

    qb.where(`doc.title ILIKE :term OR CAST(doc.correlativeNumber AS TEXT) ILIKE :term`, { term: `%${term}%` });

    if (sourceDocumentId) {
      qb.andWhere('doc.id != :sourceId', { sourceId: sourceDocumentId });
    }

    const numeric = parseInt(term, 10);

    if (!isNaN(numeric)) {
      qb.addOrderBy(`CASE WHEN doc.correlativeNumber = :exact THEN 0 ELSE 1 END`, 'ASC');
      qb.setParameter('exact', numeric);
    }
    qb.limit(10);
    const docs = await qb.getMany();
    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      code: this.buildCode(doc.correlativeNumber, doc.year),
      legalStatus: doc.legalStatus,
    }));
    return [];
  }

  private async validateDocumentRelations(typeId: number, fileId: string, relations: DocumentRelationDto[]) {
    const type = await this.documentTypeRepository.findOne({ where: { id: typeId } });
    if (!type) throw new BadRequestException('Invalid document type');

    const file = await this.fileService.findFileOrFail(fileId);
    if (file.status !== StoredFileStatus.PENDING) throw new BadRequestException('Invalid selected file');

    if (relations.length === 0) return { type, file, relations: [] };

    const relationRecord = relations.reduce(
      (acc, current) => ({ ...acc, [current.targetDocumentId]: current.type }),
      {} as Record<string, DocumentRelationType>,
    );
    const ids = Object.keys(relationRecord);

    const documents = await this.documentRepository.find({
      where: { id: In(ids) },
      select: ['id', 'title', 'summary'],
    });
    if (documents.length !== ids.length) {
      throw new BadRequestException('Invalid target document. Some documents do not exist');
    }

    return {
      type,
      file,
      relations: documents.map((doc) => ({
        targetDocument: doc,
        relationType: relationRecord[doc.id],
      })),
    };
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
}
