import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

export enum DocumentNumberingMode {
  YEARLY = 'YEARLY',
  GLOBAL = 'GLOBAL',
}

@Entity('document_types')
export class DocumentRecordType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: DocumentNumberingMode,
  })
  numberingMode: DocumentNumberingMode;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => DocumentRecord, (document) => document.type)
  documents: DocumentRecord[];
}
