import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

export enum StoredFileStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

@Entity('files')
export class StoredFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  storageKey: string;

  @Column()
  originalName: string;

  @Column()
  mimeType: string;

  @Column('bigint')
  sizeBytes: number;

  @Column({
    type: 'enum',
    enum: StoredFileStatus,
    default: StoredFileStatus.PENDING,
  })
  status: StoredFileStatus;

  @CreateDateColumn()
  createdAt: Date;
}
