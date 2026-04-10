import { HttpException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { lastValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

import { AccessTokenPayload, TokenRequestResponse } from '../interfaces';
import { TokenVerifierService } from './token-verifier.service';
import { EnvironmentVariables } from 'src/config';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class OAuthuthService {
  constructor(
    private readonly http: HttpService,
    private readonly userService: UsersService,
    private readonly tokenVerifierService: TokenVerifierService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async exchangeAuthorizationCode(code: string) {
    try {
      const { data } = await this.buildExchangeTokenRequest(code);
      const decoded: AccessTokenPayload = await this.tokenVerifierService.verifyAccessToken(data.accessToken);
      await this.userService.syncUserFromIdentity(decoded);
      return { result: data, url: this.configService.getOrThrow<string>('LOGIN_SUCCESS_REDIRECT') };
    } catch (error) {
       if (error instanceof HttpException) throw error;
      if (error instanceof AxiosError && error.response?.status === 401) {
        throw new UnauthorizedException(error.response.data);
      }
      throw new InternalServerErrorException("Code exchange can't be completed at the moment");
    }
  }

  buildAuthorizeUrl() {
    const idpUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    const clientId = this.configService.getOrThrow<string>('CLIENT_KEY');
    const redirectUri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');
    const state = crypto.randomUUID();

    const authorizeUrl = new URL(`${idpUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', state);
    return {
      url: authorizeUrl.toString(),
      state,
    };
  }

  private async buildExchangeTokenRequest(code: string) {
    const url = `${this.configService.get('IDENTITY_HUB_URL')}/oauth/token`;
    const client_id = this.configService.getOrThrow<string>('CLIENT_KEY');
    const client_secret = this.configService.getOrThrow<string>('CLIENT_SECRET');
    const redirect_uri = this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI');
    const request = this.http.post<TokenRequestResponse>(url, {
      grant_type: 'authorization_code',
      client_secret,
      redirect_uri,
      client_id,
      code,
      // code_verifier: 'abc',
    });
    return await lastValueFrom(request);
  }
}
