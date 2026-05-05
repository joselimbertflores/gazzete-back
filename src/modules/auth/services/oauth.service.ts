import {
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { lastValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';

import { TokenVerifierService } from './token-verifier.service';
import { UsersService } from 'src/modules/users/users.service';
import { TokenRequestResponse } from '../interfaces';
import { EnvironmentVariables } from 'src/config';

@Injectable()
export class OAuthService {
  constructor(
    private readonly http: HttpService,
    private readonly userService: UsersService,
    private readonly tokenVerifierService: TokenVerifierService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async exchangeAuthorizationCode(code: string) {
    const tokens = await this.exchangeCodeForTokens(code);

    const decoded = await this.tokenVerifierService.verifyAccessToken(tokens.accessToken);

    await this.userService.syncUserFromIdentity(decoded);

    return {
      tokens,
      url: this.configService.getOrThrow<string>('AUTH_SUCCESS_REDIRECT'),
    };
  }

  buildAuthorizeUrl() {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');

    const clientId = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');

    const state = crypto.randomUUID();

    const authorizeUrl = new URL(`${identityHubUrl}/oauth/authorize`);

    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', state);

    return {
      url: authorizeUrl.toString(),
      state,
    };
  }

  private async exchangeCodeForTokens(code: string) {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    const tokenUrl = new URL('/oauth/token', identityHubUrl).toString();

    const clientId = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET');
    const redirectUri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');

    const request = this.http.post<TokenRequestResponse>(tokenUrl, {
      grant_type: 'authorization_code',
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      client_id: clientId,
      code,
    });

    const { data } = await lastValueFrom(request);

    return data;
  }
}
