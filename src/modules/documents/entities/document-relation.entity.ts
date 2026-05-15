import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentRecord } from './document.entity';

export enum DocumentRelationType {
  MODIFIES = 'MODIFIES',
  ABROGATES = 'ABROGATES',
  DEROGATES = 'DEROGATES',
}

@Entity('document_relations')
@Check(`"source_document_id" <> "target_document_id"`)
@Index(['sourceDocumentId'])
@Index(['targetDocumentId'], { unique: true })
export class DocumentRelation {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Documento que produce el cambio.
   * Ejemplo: A MODIFIES B => A es source.
   */
  @ManyToOne(() => DocumentRecord, (document) => document.outgoingRelations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'source_document_id' })
  sourceDocument: DocumentRecord;

  @Column({ name: 'source_document_id' })
  sourceDocumentId: string;

  /**
   * Documento afectado.
   * Ejemplo: A MODIFIES B => B es target.
   */
  @ManyToOne(() => DocumentRecord, (document) => document.incomingRelations, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
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
