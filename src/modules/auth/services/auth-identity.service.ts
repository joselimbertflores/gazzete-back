import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

import { lastValueFrom } from 'rxjs';

import { IdentityHubTokenResponse, TokenRequestResponse } from '../interfaces';
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
      code_verifier: codeVerifier,
    });
  }

  async refreshTokens(refreshToken: string): Promise<TokenRequestResponse> {
    return this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async requestTokens(payload: Record<string, string>): Promise<TokenRequestResponse> {
    const body = new URLSearchParams(payload).toString();
    const response = await lastValueFrom(
      this.http.post<IdentityHubTokenResponse>(this.getTokenUrl(), body, {
        headers: {
          Authorization: this.getClientAuthorizationHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );

    return this.mapTokenResponse(response.data);
  }

  private getClientAuthorizationHeader(): string {
    const clientId = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET');
    const credentials = `${this.formEncode(clientId)}:${this.formEncode(clientSecret)}`;

    return `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
  }

  private formEncode(value: string): string {
    const params = new URLSearchParams({ value });
    return params.toString().slice('value='.length);
  }

  private mapTokenResponse(response: IdentityHubTokenResponse): TokenRequestResponse {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      accessTokenExpiresIn: response.expires_in,
      refreshTokenExpiresIn: response.refresh_token_expires_in,
      tokenType: response.token_type,
    };
  }

  private getTokenUrl(): string {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    return new URL('oauth/token', this.ensureTrailingSlash(identityHubUrl)).toString();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
