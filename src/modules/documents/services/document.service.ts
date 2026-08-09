import {
  Injectable,
  HttpException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { Brackets, DataSource, QueryFailedError, Repository } from 'typeorm';

import {
  DocumentRecord,
  DocumentRelation,
  DocumentRecordType,
  DocumentLegalStatus,
  DocumentNumberingMode,
} from '../entities';
import { UpdateDocumentDto, CreateDocumentDto, FindAllDocumentsQueryDto } from '../dtos';
import { FilesService } from 'src/modules/files/files.service';
import { User } from 'src/modules/users/entities';
import { EnvironmentVariables } from 'src/config';

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
    private configService: ConfigService<EnvironmentVariables, true>,
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

  async create(dto: CreateDocumentDto, currentUser: User) {
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
          createdBy: currentUser,
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

  async update(id: string, dto: UpdateDocumentDto, currentUser: User) {
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
        document.updatedBy = currentUser;

        return await manager.save(document);
      });
      return this.toDto(document);
    } catch (error: unknown) {
      this.handleDocumentErrors(error);
    }
  }

  async getDocumentDetail(id: string) {
    const doc = await this.documentRepository.findOne({
      where: { id },
      relations: {
        type: true,
        file: true,
        createdBy: true,
        updatedBy: true,
        incomingRelation: {
          sourceDocument: {
            type: true,
          },
        },
        outgoingRelations: {
          targetDocument: {
            type: true,
          },
        },
      },
    });

    if (!doc) throw new NotFoundException(`Document with id ${id} not found`);

    const { file, type, createdBy, updatedBy, incomingRelation, outgoingRelations, ...props } = doc;

    return {
      ...props,
      file: {
        url: this.buildPublicDocumentFileUrl(doc.id),
        size: file.sizeBytes,
        originalName: file.originalName,
        mimeType: file.mimeType,
      },
      type: type.name,
      createdBy: createdBy?.fullName,
      updatedBy: updatedBy?.fullName ?? null,
      incomingRelation: incomingRelation
        ? {
            id: incomingRelation.id,
            type: incomingRelation.type,
            note: incomingRelation.note,
            sourceDocument: {
              id: incomingRelation.sourceDocument.id,
              code: incomingRelation.sourceDocument.code,
              typeName: incomingRelation.sourceDocument.type.name,
              summary: incomingRelation.sourceDocument.summary,
            },
          }
        : null,
      outgoingRelations: outgoingRelations.map((relation) => ({
        id: relation.id,
        type: relation.type,
        note: relation.note,
        targetDocument: {
          id: relation.targetDocument.id,
          code: relation.targetDocument.code,
          typeName: relation.targetDocument.type.name,
          summary: relation.targetDocument.summary,
        },
      })),
    };
  }

  private generateCode(correlativeNumber: number, suffix: string | null, year: number) {
    const normalizedSuffix = suffix?.trim().toUpperCase();
    const formattedNumber = correlativeNumber.toString().padStart(3, '0');
    return normalizedSuffix ? `${formattedNumber}-${normalizedSuffix}/${year}` : `${formattedNumber}/${year}`;
  }

  private buildNumberingScope(type: DocumentRecordType, year: number): string {
    return type.numberingMode === DocumentNumberingMode.GLOBAL ? 'GLOBAL' : String(year);
  }

  private toDto(doc: DocumentRecord) {
    const { file, ...rest } = doc;
    return {
      ...rest,
      file: { url: this.buildPublicDocumentFileUrl(doc.id), name: file.originalName, size: file.sizeBytes },
    };
  }

  private handleDocumentErrors(error: unknown) {
    if (error instanceof HttpException) throw error;
    if (error instanceof QueryFailedError && error['code'] === '23505') {
      throw new ConflictException('El numero correlativo ingresado ya existe.');
    }
    throw new InternalServerErrorException('Error creating document');
  }

  private buildPublicDocumentFileUrl(documentId: string) {
    const baseUrl = this.configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true });
    const url = new URL(`/public-documents/${documentId}/file`, baseUrl);
    return url.toString();
  }
}
