import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';

import { DataSource, LessThanOrEqual, Repository } from 'typeorm';

import type { User } from 'src/modules/users/entities';
import type { IdentityHubTokenResponse } from '../interfaces/identity-hub-token.interface';
import { AuthSession } from '../entities/auth-session.entity';
import { AuthIdentityService, IdentityHubTokenRequestError } from './auth-identity.service';

export class SessionReauthorizationRequiredError extends Error {
  constructor() {
    super('The local session requires a new authorization');
    this.name = SessionReauthorizationRequiredError.name;
  }
}

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
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: { user: true },
    });

    if (!session) return null;

    if (session.refreshTokenExpiresAt.getTime() <= Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  async refreshSession(sessionId: string, expiredAccessToken: string): Promise<AuthSession> {
    const requiresReauthorization = await this.dataSource.transaction<boolean>(async (manager) => {
      const repository = manager.getRepository(AuthSession);
      const session = await repository.findOne({
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) return true;

      if (session.refreshTokenExpiresAt.getTime() <= Date.now()) {
        await repository.delete({ id: session.id });
        return true;
      }

      if (session.accessToken !== expiredAccessToken) {
        return false;
      }

      try {
        const tokens = await this.identityService.refreshTokens(session.refreshToken);
        session.accessToken = tokens.access_token;
        session.refreshToken = tokens.refresh_token;
        session.refreshTokenExpiresAt = this.expiresAt(tokens.refresh_token_expires_in);
        await repository.save(session);
        return false;
      } catch (error: unknown) {
        if (error instanceof IdentityHubTokenRequestError && error.oauthError === 'invalid_grant') {
          await repository.delete({ id: session.id });
          return true;
        }

        throw error;
      }
    });

    if (requiresReauthorization) {
      throw new SessionReauthorizationRequiredError();
    }

    const session = await this.findActiveSession(sessionId);
    if (!session) throw new SessionReauthorizationRequiredError();

    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepository.delete({ id: sessionId });
  }

  private expiresAt(expiresInSeconds: number): Date {
    return new Date(Date.now() + expiresInSeconds * 1000);
  }
}
