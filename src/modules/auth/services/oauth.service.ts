import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import { AuthIdentityService } from './auth-identity.service';
import { TokenVerifierService } from './token-verifier.service';
import { UsersService } from 'src/modules/users/users.service';
import { EnvironmentVariables } from 'src/config';
import { PkceService } from './pkce.service';
import { AuthSessionService } from './auth-session.service';
import type { AuthSession } from '../entities';
import { OAuthTransactionService } from './oauth-transaction.service';

@Injectable()
export class OAuthService {
  constructor(
    private readonly authIdentityService: AuthIdentityService,
    private readonly usersService: UsersService,
    private readonly tokenVerifierService: TokenVerifierService,
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly pkceService: PkceService,
    private readonly authSessionService: AuthSessionService,
    private readonly oauthTransactionService: OAuthTransactionService,
  ) {}

  async completeAuthorizationCodeFlow(code: string, codeVerifier: string): Promise<AuthSession> {
    const tokens = await this.authIdentityService.exchangeAuthorizationCode(code, codeVerifier);
    const decodedAccessToken = await this.tokenVerifierService.verifyAccessToken(tokens.access_token);

    const user = await this.usersService.syncUserFromIdentity(decodedAccessToken);

    return this.authSessionService.createSession(user, tokens);
  }

  async createAuthorizationRequest(): Promise<{ url: string; transactionId: string }> {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    const clientId = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = this.pkceService.generateCodeVerifier();
    const codeChallenge = this.pkceService.buildCodeChallenge(codeVerifier);
    const authorizeUrl = new URL('oauth/authorize', this.ensureTrailingSlash(identityHubUrl));

    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    const transactionId = await this.oauthTransactionService.create(state, codeVerifier);

    return {
      url: authorizeUrl.toString(),
      transactionId,
    };
  }

  consumeAuthorizationRequest(transactionId: string, state: string) {
    return this.oauthTransactionService.consume(transactionId, state);
  }

  discardAuthorizationRequest(transactionId: string): Promise<void> {
    return this.oauthTransactionService.discard(transactionId);
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
