import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';

import { OAuthTransaction } from '../entities/oauth-transaction.entity';

export const OAUTH_TRANSACTION_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OAuthTransactionService {
  constructor(
    @InjectRepository(OAuthTransaction)
    private readonly transactionRepository: Repository<OAuthTransaction>,
    private readonly dataSource: DataSource,
  ) {}

  async create(state: string, codeVerifier: string): Promise<string> {
    await this.transactionRepository.delete({ expiresAt: LessThanOrEqual(new Date()) });

    const transaction = this.transactionRepository.create({
      id: randomBytes(32).toString('base64url'),
      stateHash: this.hashState(state),
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_TRANSACTION_TTL_MS),
    });

    return (await this.transactionRepository.save(transaction)).id;
  }

  consume(transactionId: string, state: string): Promise<string | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OAuthTransaction);
      const transaction = await repository.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) return null;

      const expectedHash = Buffer.from(transaction.stateHash, 'hex');
      const receivedHash = Buffer.from(this.hashState(state), 'hex');
      const isValid = transaction.expiresAt.getTime() > Date.now() && timingSafeEqual(expectedHash, receivedHash);

      await repository.delete({ id: transaction.id });

      return isValid ? transaction.codeVerifier : null;
    });
  }

  async discard(transactionId: string): Promise<void> {
    await this.transactionRepository.delete({ id: transactionId });
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }
}
