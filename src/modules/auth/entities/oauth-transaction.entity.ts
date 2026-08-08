import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('oauth_transactions')
@Index('idx_oauth_transactions_expires_at', ['expiresAt'])
export class OAuthTransaction {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'char', length: 64 })
  stateHash: string;

  @Column({ type: 'varchar', length: 128 })
  codeVerifier: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
