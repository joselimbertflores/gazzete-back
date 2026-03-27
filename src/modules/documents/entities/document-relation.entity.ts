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

  @CreateDateColumn()
  createdAt: Date;
  
}
