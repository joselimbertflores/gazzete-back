import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, ILike, In, Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordType, DocumentRelation, DocumentRelationType } from '../entities';
import { StoredFile, StoredFileStatus } from 'src/modules/files/entities/stored-file.entity';
import { FilesService } from 'src/modules/files/files.service';
import { CreateDocumentDto, DocumentRelationDto, SearchDocumentForRelationDto } from '../dtos';
import { PaginationParamsDto } from 'src/modules/common';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
    private dataSource: DataSource,
  ) {}

  async findAll({ limit, offset, term }: PaginationParamsDto) {
    const [documents, total] = await this.documentRepository.findAndCount({
      ...(term && { where: { title: ILike(`%${term}%`) } }),
      take: limit,
      skip: offset,
      relations: ['type', 'file'],
      order: { publicationDate: 'DESC' },
    });

    return {
      documents: documents.map((doc) => this.toDto(doc)),
      total,
    };
  }

  async create(dto: CreateDocumentDto) {
    const { typeId, fileId, relations = [], ...rest } = dto;

    const validProps = await this.validateDocumentRelations(typeId, fileId, relations);

    return this.dataSource.transaction(async (manager) => {
      const createdDocument = manager.create(DocumentRecord, {
        type: validProps.type,
        file: validProps.file,
        year: rest.publicationDate.getFullYear(),
        ...rest,
      });

      await manager.save(createdDocument);

      if (relations.length) {
        await manager.save(
          validProps.relations.map(({ targetDocument, relationType }) =>
            manager.create(DocumentRelation, { sourceDocument: createdDocument, targetDocument, relationType }),
          ),
        );
      }
      await manager.update(StoredFile, dto.fileId, { status: StoredFileStatus.ACTIVE });
      return createdDocument;
    });
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
}
