import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthIdentityService } from './auth-identity.service';
import { TokenVerifierService } from './token-verifier.service';
import { UsersService } from 'src/modules/users/users.service';
import { TokenRequestResponse } from '../interfaces';
import { EnvironmentVariables } from 'src/config';

@Injectable()
export class OAuthService {
  constructor(
    private readonly authIdentityService: AuthIdentityService,
    private readonly usersService: UsersService,
    private readonly tokenVerifierService: TokenVerifierService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async completeAuthorizationCodeFlow(code: string): Promise<TokenRequestResponse> {
    const tokens = await this.authIdentityService.exchangeAuthorizationCode(code);
    const decodedAccessToken = await this.tokenVerifierService.verifyAccessToken(tokens.accessToken);

    await this.usersService.syncUserFromIdentity(decodedAccessToken);

    return tokens;
  }

  buildAuthorizeUrl() {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    const clientId = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');
    const state = crypto.randomUUID();
    const authorizeUrl = new URL('oauth/authorize', this.ensureTrailingSlash(identityHubUrl));

    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', state);

    return {
      url: authorizeUrl.toString(),
      state,
    };
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
