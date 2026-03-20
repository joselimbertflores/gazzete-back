import { StoredFile } from 'src/modules/files/entities/stored-file.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DocumentRecordType } from './document-type.entity';

export enum DocumentLegalStatus {
  VALID = 'VALID',
  ABROGATED = 'ABROGATED',
  DEROGATED = 'DEROGATED',
  MODIFIED = 'MODIFIED',
}

@Index(['typeId', 'correlativeNumber', 'numberingScope'], { unique: true })
@Entity('documents')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @ManyToOne(() => DocumentRecordType)
  @JoinColumn({ name: 'typeId' })
  type: DocumentRecordType;

  @Column()
  typeId: number;

  @Column({ type: 'integer' })
  correlativeNumber: number;

  @Column({ type: 'integer' })
  year: number;

  /**
   * Campo técnico para soportar unicidad flexible:
   * - YEARLY => "2026"
   * - GLOBAL => "GLOBAL"
   */
  @Column({ type: 'varchar', length: 20 })
  numberingScope: string;

  @Column({
    type: 'enum',
    enum: DocumentLegalStatus,
    default: DocumentLegalStatus.VALID,
  })
  legalStatus: DocumentLegalStatus;

  @Column({ type: 'date', nullable: true })
  promulgationDate: Date;

  @Column({ type: 'date' })
  publicationDate: Date;

  @Column({ type: 'date', nullable: true })
  validUntil: Date;

  @ManyToOne(() => StoredFile)
  @JoinColumn({ name: 'fileId' })
  file: StoredFile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
