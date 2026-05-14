import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

export enum DocumentRelationType {
  MODIFIES = 'MODIFIES',
  ABROGATES = 'ABROGATES',
  DEROGATES = 'DEROGATES',
}

@Index(['targetDocumentId'], { unique: true })
@Entity('document_relations')
export class DocumentRelation {
  @PrimaryGeneratedColumn()
  id: number;

  //  Un documento puede tener MUCHAS relaciones salientes
  //  A → B
  //  A → C
  //  A → D
  @ManyToOne(() => DocumentRecord, (document) => document.outgoingRelations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'source_document_id' })
  sourceDocument: DocumentRecord;

  @Column({ name: 'source_document_id' })
  sourceDocumentId: string;

  @ManyToOne(() => DocumentRecord)
  @JoinColumn({ name: 'target_document_id' })
  targetDocument: DocumentRecord;

  @Column({ name: 'target_document_id' })
  targetDocumentId: string;

  @Column({
    type: 'enum',
    enum: DocumentRelationType,
  })
  type: DocumentRelationType;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
