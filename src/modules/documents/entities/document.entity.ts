import { StoredFile } from 'src/modules/files/entities/stored-file.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DocumentRecordType } from './document-type.entity';

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
  number: number;

  @Column()
  year: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

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
