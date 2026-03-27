import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '../dtos/document-type.dto';
import { DocumentRecordType } from '../entities';

@Injectable()
export class DocumentTypeService {
  constructor(@InjectRepository(DocumentRecordType) private documentTypeRepository: Repository<DocumentRecordType>) {}

  async create(dto: CreateDocumentTypeDto) {
    const documentType = this.documentTypeRepository.create(dto);
    return this.documentTypeRepository.save(documentType);
  }

  findAll() {
    return this.documentTypeRepository.find({ order: { id: 'DESC' } });
  }

  async update(id: number, dto: UpdateDocumentTypeDto) {
    const type = await this.documentTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Document type not found');
    Object.assign(type, dto);
    return this.documentTypeRepository.save(type);
  }

  async getActiveTypes() {
    return this.documentTypeRepository.find({ where: { isActive: true } });
  }
}
