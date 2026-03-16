import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, In, Repository } from 'typeorm';

import { DocumentRecord, DocumentRecordType, DocumentRelation, DocumentRelationType } from '../entities';
import { StoredFile, StoredFileStatus } from 'src/modules/files/entities/stored-file.entity';
import { FilesService } from 'src/modules/files/files.service';
import { CreateDocumentDto, DocumentRelationDto } from '../dtos';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateDocumentDto) {
    const { typeId, fileId, relations = [], ...rest } = dto;

    const validProps = await this.validateDocumentRelations(typeId, fileId, relations);

    return this.dataSource.transaction(async (manager) => {
      const createdDocument = manager.create(DocumentRecord, { type: validProps.type, file: validProps.file, ...rest });

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

  async validateDocumentRelations(typeId: number, fileId: string, relations: DocumentRelationDto[]) {
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
      select: ['id', 'title', 'summary', 'number', 'year'],
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
}
