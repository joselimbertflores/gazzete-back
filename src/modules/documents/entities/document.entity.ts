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

import { DocumentRelation } from './document-relation.entity';
import { DocumentRecordType } from './document-type.entity';
import { User } from 'src/modules/users/entities';

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

@Index(['typeId', 'correlativeNumber', 'suffix', 'numberingScope'], {
  unique: true,
  where: `"suffix" IS NOT NULL`,
})
@Index(['typeId', 'correlativeNumber', 'numberingScope'], {
  unique: true,
  where: `"suffix" IS NULL`,
})
@Entity('documents')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  summary: string;

  @ManyToOne(() => DocumentRecordType)
  @JoinColumn({ name: 'typeId' })
  type: DocumentRecordType;

  @Column()
  typeId: number;

  @Column({ type: 'integer' })
  correlativeNumber: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  suffix: string | null;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

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

  @Column({ type: 'int', default: 0 })
  downloadCount: number;

  @Column({ type: 'date' })
  publicationDate: Date;

  @Column({ type: 'date', nullable: true })
  promulgationDate: Date | null;

  @Column({ type: 'date', nullable: true })
  validUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy: User | null;

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById?: string | null;

  @ManyToOne(() => StoredFile)
  @JoinColumn({ name: 'fileId' })
  file: StoredFile;

  @Column({ nullable: true })
  fileId: string;

  @OneToMany(() => DocumentRelation, (relation) => relation.sourceDocument)
  outgoingRelations: DocumentRelation[];

  @OneToMany(() => DocumentRelation, (relation) => relation.targetDocument)
  incomingRelations: DocumentRelation[];
}
