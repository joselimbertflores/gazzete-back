import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

@Entity('document_types')
export class DocumentType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => DocumentRecord, (document) => document.type)
  documents: DocumentRecord[];
}
