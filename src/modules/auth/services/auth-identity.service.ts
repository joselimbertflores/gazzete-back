import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

import { lastValueFrom } from 'rxjs';

import { TokenRequestResponse } from '../interfaces';
import { EnvironmentVariables } from 'src/config';

@Injectable()
export class AuthIdentityService {
  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<TokenRequestResponse> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.configService.getOrThrow<string>('OAUTH_REDIRECT_URI'),
      client_id: this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET'),
      code_verifier: codeVerifier,
    });
  }

  async refreshTokens(refreshToken: string): Promise<TokenRequestResponse> {
    return this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET'),
    });
  }

  private async requestTokens(payload: Record<string, string>): Promise<TokenRequestResponse> {
    const response = await lastValueFrom(this.http.post<TokenRequestResponse>(this.getTokenUrl(), payload));
    return response.data;
  }

  private getTokenUrl(): string {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    return new URL('oauth/token', this.ensureTrailingSlash(identityHubUrl)).toString();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
