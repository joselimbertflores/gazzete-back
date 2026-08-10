import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dtos/document-type.dto';
import { DocumentRecord, DocumentRecordType } from '../entities';
import { generateSlug } from 'src/helpers';

interface PostgresError {
  code?: string;
  constraint?: string;
}

@Injectable()
export class DocumentTypeService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateDocumentTypeDto) {
    const slug = generateSlug(dto.name);
    if (!slug) throw new BadRequestException('El nombre del tipo no permite generar un slug válido.');

    try {
      const documentType = this.documentTypeRepository.create({ ...dto, slug });
      return await this.documentTypeRepository.save(documentType);
    } catch (error: unknown) {
      this.handleTypeErrors(error);
    }
  }

  findAll() {
    return this.documentTypeRepository.find({ order: { id: 'DESC' } });
  }

  async update(id: number, dto: UpdateDocumentTypeDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const type = await manager.findOne(DocumentRecordType, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!type) throw new NotFoundException('Document type not found');

        if (dto.numberingMode && dto.numberingMode !== type.numberingMode) {
          const documentCount = await manager.count(DocumentRecord, { where: { typeId: id } });
          if (documentCount > 0) {
            throw new ConflictException(
              'No se puede cambiar el modo de numeración de un tipo que ya tiene documentos.',
            );
          }
        }

        Object.assign(type, dto);
        return manager.save(type);
      });
    } catch (error: unknown) {
      this.handleTypeErrors(error);
    }
  }

  async getTypeOptions() {
    return this.documentTypeRepository.find({ where: { isActive: true }, select: ['id', 'name'] });
  }

  private handleTypeErrors(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as PostgresError;
      if (driverError.code !== '23505') {
        throw new InternalServerErrorException('Error al guardar el tipo de documento.');
      }

      const constraint = driverError.constraint;
      if (constraint === 'UQ_document_types_slug') {
        throw new ConflictException('Ya existe un tipo de documento con el mismo slug.');
      }
      throw new ConflictException('Ya existe un tipo de documento con el mismo nombre.');
    }

    throw new InternalServerErrorException('Error al guardar el tipo de documento.');
  }
}
