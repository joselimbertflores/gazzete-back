import {
  Injectable,
  HttpException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, DataSource, QueryFailedError, Repository } from 'typeorm';

import {
  DocumentRecord,
  DocumentRelation,
  DocumentRecordType,
  DocumentLegalStatus,
  DocumentRelationType,
  DocumentNumberingMode,
} from '../entities';
import {
  UpdateDocumentDto,
  CreateDocumentDto,
  ChangeDocumentStatusDto,
  FindAllDocumentsQueryDto,
  SearchDocumentForRelationDto,
} from '../dtos';
import { FilesService } from 'src/modules/files/files.service';

@Injectable()
export class DocumentService {
  private readonly relationToStatusMap: Partial<Record<DocumentRelationType, DocumentLegalStatus>> = {
    [DocumentRelationType.MODIFIES]: DocumentLegalStatus.MODIFIED,
    [DocumentRelationType.ABROGATES]: DocumentLegalStatus.ABROGATED,
    [DocumentRelationType.DEROGATES]: DocumentLegalStatus.DEROGATED,
  };

  constructor(
    @InjectRepository(DocumentRelation) private docRelationRepository: Repository<DocumentRelation>,
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private fileService: FilesService,
    private dataSource: DataSource,
  ) {}

  async findAll({ limit, offset, term, typeId, year, legalStatus }: FindAllDocumentsQueryDto) {
    const queryBuilder = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.type', 'type')
      .leftJoinAndSelect('document.file', 'file')
      .take(limit)
      .skip(offset)
      .orderBy('document.createdAt', 'DESC');

    if (term?.trim()) {
      const normalizedTerm = term.trim();
      queryBuilder.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('document.code ILIKE :term', { term: `%${normalizedTerm}%` })
            .orWhere('document.summary ILIKE :term', { term: `%${normalizedTerm}%` });
        }),
      );
    }

    if (typeId) {
      queryBuilder.andWhere('document.typeId = :typeId', { typeId });
    }

    if (year) {
      queryBuilder.andWhere('document.year = :year', { year });
    }

    if (legalStatus) {
      queryBuilder.andWhere('document.legalStatus = :legalStatus', {
        legalStatus,
      });
    }

    const [documents, total] = await queryBuilder.getManyAndCount();

    return {
      documents: documents.map((doc) => this.toDto(doc)),
      total,
    };
  }

  async create(dto: CreateDocumentDto) {
    const { typeId, fileId, ...rest } = dto;
    try {
      const document = await this.dataSource.transaction(async (manager) => {
        const type = await manager.findOneBy(DocumentRecordType, { id: typeId });
        if (!type) throw new BadRequestException('Invalid document type');

        const file = await this.fileService.getPendingFileOrFail(fileId, manager);

        const numberingScope = this.buildNumberingScope(type, rest.year);
        const code = this.generateCode(rest.correlativeNumber, rest.suffix ?? null, rest.year);

        const document = manager.create(DocumentRecord, {
          ...rest,
          type,
          file,
          code,
          numberingScope,
        });

        const saved = await manager.save(document);

        await this.fileService.markAsActive(file.id, manager);

        return saved;
      });
      return this.toDto(document);
    } catch (error: unknown) {
      this.handleDocumentErrors(error);
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const { typeId, fileId, ...rest } = dto;

    try {
      const document = await this.dataSource.transaction(async (manager) => {
        const document = await manager.findOne(DocumentRecord, {
          where: { id },
          relations: { file: true, type: true },
        });
        if (!document) throw new NotFoundException('Document not found');

        if (typeId) {
          const type = await manager.findOne(DocumentRecordType, { where: { id: typeId } });
          if (!type) throw new BadRequestException('Invalid document type');
          document.type = type;
        }

        if (fileId && fileId !== document.file.id) {
          const newFile = await this.fileService.getPendingFileOrFail(fileId, manager);

          const oldFile = document.file;

          document.file = newFile;

          await this.fileService.markAsActive(newFile.id, manager);
          await this.fileService.markAsDeleted(oldFile.id, manager);
        }

        Object.assign(document, rest);
        document.code = this.generateCode(document.correlativeNumber, document.suffix, document.year);
        document.numberingScope = this.buildNumberingScope(document.type, document.year);

        return await manager.save(document);
      });
      return this.toDto(document);
    } catch (error: unknown) {
      this.handleDocumentErrors(error);
    }
  }

  async changeStatus(targetDocumentId: string, dto: ChangeDocumentStatusDto) {
    const { sourceDocumentId, relationType, description } = dto;

    if (targetDocumentId === sourceDocumentId) {
      throw new BadRequestException('Un documento no puede afectarse a sí mismo.');
    }

    const [target, source] = await Promise.all([
      this.documentRepository.findOne({ where: { id: targetDocumentId } }),
      this.documentRepository.findOne({ where: { id: sourceDocumentId } }),
    ]);

    if (!target || !source) throw new NotFoundException('Documento no encontrado.');

    if (target.legalStatus !== DocumentLegalStatus.VALID) {
      throw new BadRequestException('El documento a modificar debe estar vigente.');
    }

    if (source.legalStatus !== DocumentLegalStatus.VALID) {
      throw new BadRequestException('El documento que provoca el cambio debe estar vigente.');
    }

    await this.docRelationRepository.delete({ targetDocumentId });

    const relation = this.docRelationRepository.create({
      sourceDocumentId,
      targetDocumentId,
      relationType,
      description,
    });

    await this.docRelationRepository.save(relation);

    const newStatus = this.mapRelationToStatus(relationType);

    if (newStatus) {
      await this.documentRepository.update(targetDocumentId, { legalStatus: newStatus });
    }

    return {
      ok: true,
      message: 'Estado actualizado correctamente.',
      newStatus: newStatus,
    };
  }

  async findRelationByTarget(targetId: string) {
    const relation = await this.docRelationRepository.findOne({
      where: { targetDocumentId: targetId },
      relations: {
        sourceDocument: true,
      },
    });

    if (!relation) return null;

    return {
      type: relation.relationType,
      description: relation.description,
      source: {
        id: relation.sourceDocument.id,
        code: relation.sourceDocument.code,
      },
    };
  }

  async searchRelationCandidates({ term, sourceDocumentId }: SearchDocumentForRelationDto) {
    const normalizedTerm = term.trim();

    const queryBuilder = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.type', 'type')
      .select([
        'document.id',
        'document.summary',
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
          qb.where('document.summary ILIKE :summary', { summary: `%${normalizedTerm}%` });
        }
      }),
    );

    const documents = await queryBuilder.getMany();

    return documents.map((doc) => ({
      id: doc.id,
      year: doc.year,
      code: doc.code,
      legalStatus: doc.legalStatus,
      publicationDate: doc.publicationDate,
      correlativeNumber: doc.correlativeNumber,
      type: {
        id: doc.type.id,
        name: doc.type.name,
      },
    }));
  }

  private generateCode(correlativeNumber: number, suffix: string | null, year: number) {
    const normalizedSuffix = suffix?.trim().toUpperCase();
    const formattedNumber = correlativeNumber.toString().padStart(3, '0');
    return normalizedSuffix ? `${formattedNumber}-${normalizedSuffix}/${year}` : `${formattedNumber}/${year}`;
  }

  private buildNumberingScope(type: DocumentRecordType, year: number): string {
    return type.numberingMode === DocumentNumberingMode.GLOBAL ? 'GLOBAL' : String(year);
  }

  private mapRelationToStatus(type: DocumentRelationType): DocumentLegalStatus | null {
    return this.relationToStatusMap[type] ?? null;
  }

  private toDto(doc: DocumentRecord) {
    const { file, ...rest } = doc;
    return {
      ...rest,
      file: {
        url: this.fileService.buildPublicFileUrl(file.id),
        name: file.originalName,
        size: file.sizeBytes,
      },
    };
  }

  private handleDocumentErrors(error: unknown) {
    if (error instanceof HttpException) throw error;
    if (error instanceof QueryFailedError && error['code'] === '23505') {
      throw new ConflictException('El numero correlativo ingresado ya existe.');
    }
    throw new InternalServerErrorException('Error creating document');
  }
}
