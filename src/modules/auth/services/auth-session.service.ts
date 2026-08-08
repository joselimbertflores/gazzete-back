import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';

import { DataSource, LessThanOrEqual, Repository } from 'typeorm';

import type { User } from 'src/modules/users/entities';
import type { IdentityHubTokenResponse } from '../interfaces';
import { AuthSession } from '../entities';
import { AuthIdentityService, IdentityHubTokenRequestError } from './auth-identity.service';

export class SessionReauthorizationRequiredError extends Error {
  constructor() {
    super('The local session requires a new authorization');
    this.name = SessionReauthorizationRequiredError.name;
  }
}

type RefreshOutcome = 'current' | 'refreshed' | 'missing' | 'invalid_grant';

@Injectable()
export class AuthSessionService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    private readonly dataSource: DataSource,
    private readonly identityService: AuthIdentityService,
  ) {}

  async createSession(user: User, tokens: IdentityHubTokenResponse): Promise<AuthSession> {
    await this.sessionRepository.delete({ refreshTokenExpiresAt: LessThanOrEqual(new Date()) });

    const session = this.sessionRepository.create({
      id: randomBytes(32).toString('base64url'),
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      refreshTokenExpiresAt: this.expiresAt(tokens.refresh_token_expires_in),
    });

    return this.sessionRepository.save(session);
  }

  async findActiveSession(sessionId: string): Promise<AuthSession | null> {
    const session = await this.loadSession(sessionId);

    if (!session) return null;

    if (session.refreshTokenExpiresAt.getTime() <= Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  async refreshSession(sessionId: string, expiredAccessToken: string): Promise<AuthSession> {
    const outcome = await this.dataSource.transaction<RefreshOutcome>(async (manager) => {
      const repository = manager.getRepository(AuthSession);
      const session = await repository.findOne({
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) return 'missing';

      if (session.refreshTokenExpiresAt.getTime() <= Date.now()) {
        await repository.delete({ id: session.id });
        return 'missing';
      }

      if (session.accessToken !== expiredAccessToken) {
        return 'current';
      }

      try {
        const tokens = await this.identityService.refreshTokens(session.refreshToken);
        session.accessToken = tokens.access_token;
        session.refreshToken = tokens.refresh_token;
        session.refreshTokenExpiresAt = this.expiresAt(tokens.refresh_token_expires_in);
        await repository.save(session);
        return 'refreshed';
      } catch (error: unknown) {
        if (error instanceof IdentityHubTokenRequestError && error.oauthError === 'invalid_grant') {
          await repository.delete({ id: session.id });
          return 'invalid_grant';
        }

        throw error;
      }
    });

    if (outcome === 'missing' || outcome === 'invalid_grant') {
      throw new SessionReauthorizationRequiredError();
    }

    const session = await this.findActiveSession(sessionId);
    if (!session) throw new SessionReauthorizationRequiredError();

    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepository.delete({ id: sessionId });
  }

  private loadSession(sessionId: string): Promise<AuthSession | null> {
    return this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: { user: true },
    });
  }

  private expiresAt(expiresInSeconds: number): Date {
    return new Date(Date.now() + expiresInSeconds * 1000);
  }
}
