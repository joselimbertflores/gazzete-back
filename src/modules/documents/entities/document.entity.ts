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

export enum LegalStatus {
  VALID = 'VALID',
  ABROGATED = 'ABROGATED',
  DEROGATED = 'DEROGATED',
  MODIFIED = 'MODIFIED',
}

@Index(['typeId', 'correlativeNumber'], { unique: true })
@Entity('documents')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DocumentRecordType)
  @JoinColumn({ name: 'typeId' })
  type: DocumentRecordType;

  @Column()
  typeId: number;

  @Column()
  correlativeNumber: number;

  @Column()
  year: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({
    type: 'enum',
    enum: LegalStatus,
    default: LegalStatus.VALID,
  })
  legalStatus: LegalStatus;

  @Column({ type: 'date', nullable: true })
  promulgationDate: Date;

  @Column({ type: 'date' })
  publicationDate: Date;

  @Column({ type: 'date', nullable: true })
  validUntil: Date;

  @ManyToOne(() => StoredFile)
  @JoinColumn({ name: 'fileId' })
  file: StoredFile;

  @Column({ nullable: true })
  fileId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
