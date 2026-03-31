import { StoredFile } from 'src/modules/files/entities/stored-file.entity';
import {
  Index,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DocumentRecordType } from './document-type.entity';
import { DocumentRelation } from './document-relation.entity';

export enum DocumentLegalStatus {
  VALID = 'VALID',
  ABROGATED = 'ABROGATED',
  DEROGATED = 'DEROGATED',
  MODIFIED = 'MODIFIED',
}

export enum DocumentRecordStatus {
  PUBLISHED = 'PUBLISHED',
  DISABLED = 'DISABLED',
}

@Index(['typeId', 'correlativeNumber', 'numberingScope'], { unique: true })
@Entity('documents')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text'})
  summary: string;

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
    enum: DocumentRecordStatus,
    default: DocumentRecordStatus.PUBLISHED,
  })
  status: DocumentRecordStatus;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => StoredFile)
  @JoinColumn({ name: 'fileId' })
  file: StoredFile;

  @Column({ nullable: true })
  fileId: string;

  @OneToMany(() => DocumentRelation, (relation) => relation.sourceDocument)
  outgoingRelations: DocumentRelation[];
}
