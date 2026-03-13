import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

export enum DocumentRelationType {
  MODIFIES = 'MODIFIES',
  ABROGATES = 'ABROGATES',
  DEROGATES = 'DEROGATES',
  RECTIFIES = 'RECTIFIES',
  REGULATES = 'REGULATES',
  REFERENCES = 'REFERENCES',
}

@Entity('document_relations')
export class DocumentRelation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DocumentRecord)
  @JoinColumn({ name: 'sourceDocumentId' })
  sourceDocument: DocumentRecord;

  @Column()
  sourceDocumentId: string;

  @ManyToOne(() => DocumentRecord)
  @JoinColumn({ name: 'targetDocumentId' })
  targetDocument: DocumentRecord;

  @Column()
  targetDocumentId: string;

  @Column({
    type: 'enum',
    enum: DocumentRelationType,
  })
  relationType: DocumentRelationType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'int', nullable: true })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
