import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dtos/document-type.dto';
import { DocumentRecord, DocumentRecordType } from '../entities';

@Injectable()
export class DocumentTypeService {
  constructor(
    @InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>,
    @InjectRepository(DocumentRecord) private documentRepository: Repository<DocumentRecord>,
  ) {}

  async create(createDocumentTypeDto: CreateDocumentTypeDto) {
    await this.ensureNameIsAvailable(createDocumentTypeDto.name);

    const documentType = this.documentTypeRepository.create(createDocumentTypeDto);
    return this.documentTypeRepository.save(documentType);
  }

  findAll() {
    return this.documentTypeRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number) {
    return this.findByIdOrFail(id);
  }

  async update(id: number, updateDocumentTypeDto: UpdateDocumentTypeDto) {
    const documentType = await this.findByIdOrFail(id);

    if (updateDocumentTypeDto.name && updateDocumentTypeDto.name !== documentType.name) {
      await this.ensureNameIsAvailable(updateDocumentTypeDto.name, id);
    }

    Object.assign(documentType, updateDocumentTypeDto);

    return this.documentTypeRepository.save(documentType);
  }

  async remove(id: number) {
    const documentType = await this.findByIdOrFail(id);

    const linkedDocuments = await this.documentRepository.count({
      where: { typeId: id },
    });

    if (linkedDocuments > 0) {
      throw new ConflictException('Document type cannot be removed because it is used by documents');
    }

    await this.documentTypeRepository.remove(documentType);

    return {
      id,
      deleted: true,
    };
  }

  private async findByIdOrFail(id: number) {
    const documentType = await this.documentTypeRepository.findOne({
      where: { id },
    });

    if (!documentType) {
      throw new NotFoundException(`Document type with id ${id} not found`);
    }

    return documentType;
  }

  private async ensureNameIsAvailable(name: string, currentId?: number) {
    const existingDocumentType = await this.documentTypeRepository.findOne({
      where: { name },
    });

    if (existingDocumentType && existingDocumentType.id !== currentId) {
      throw new ConflictException(`Document type with name "${name}" already exists`);
    }
  }
}
