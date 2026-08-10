import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

export enum DocumentNumberingMode {
  YEARLY = 'YEARLY',
  GLOBAL = 'GLOBAL',
}

@Index('UQ_document_types_slug', ['slug'], {
  unique: true,
})
@Entity('document_types')
export class DocumentRecordType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  // TODO(slug-backfill): Set nullable to false and change this type to string
  // after the historical slug backfill succeeds.
  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

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
