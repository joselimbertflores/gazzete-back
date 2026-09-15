import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

import { isAxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';

import { IdentityHubTokenResponse } from '../interfaces/identity-hub-token.interface';
import { EnvironmentVariables } from 'src/config';

interface IdentityHubOAuthErrorResponse {
  error: string;
}

export class IdentityHubTokenRequestError extends Error {
  constructor(
    public readonly oauthError: string,
    public readonly statusCode: number,
  ) {
    super(`Identity Hub rejected the token request with ${oauthError}`);
    this.name = IdentityHubTokenRequestError.name;
  }
}

export class IdentityHubUnavailableError extends Error {
  constructor() {
    super('Identity Hub token service is temporarily unavailable');
    this.name = IdentityHubUnavailableError.name;
  }
}

export class IdentityHubTokenProtocolError extends Error {
  constructor() {
    super('Identity Hub returned an invalid token response');
    this.name = IdentityHubTokenProtocolError.name;
  }
}

export class IdentityHubLogoutError extends Error {
  constructor() {
    super('Identity Hub rejected or could not process the global logout request');
    this.name = IdentityHubLogoutError.name;
  }
}

@Injectable()
export class AuthIdentityService {
  private readonly requestTimeoutMs = 10_000;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<IdentityHubTokenResponse> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.getRedirectUri(),
      code_verifier: codeVerifier,
    });
  }

  async refreshTokens(refreshToken: string): Promise<IdentityHubTokenResponse> {
    return this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async logoutIdentitySession(identitySid: string): Promise<void> {
    try {
      await lastValueFrom(
        this.http.post(
          this.getIdentitySessionLogoutUrl(),
          { sid: identitySid },
          {
            headers: {
              Authorization: this.getClientAuthorizationHeader(),
              'Content-Type': 'application/json',
            },
            timeout: this.requestTimeoutMs,
          },
        ),
      );
    } catch {
      throw new IdentityHubLogoutError();
    }
  }

  private async requestTokens(payload: Record<string, string>): Promise<IdentityHubTokenResponse> {
    const body = new URLSearchParams(payload).toString();
    let responseData: IdentityHubTokenResponse;

    try {
      const response = await lastValueFrom(
        this.http.post<IdentityHubTokenResponse>(this.getTokenUrl(), body, {
          headers: {
            Authorization: this.getClientAuthorizationHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: this.requestTimeoutMs,
        }),
      );

      responseData = response.data;
    } catch (error: unknown) {
      if (!isAxiosError(error) || error.response?.status === undefined || error.response.status >= 500) {
        throw new IdentityHubUnavailableError();
      }

      const responseData = error.response.data as Partial<IdentityHubOAuthErrorResponse> | undefined;
      if (typeof responseData?.error === 'string') {
        throw new IdentityHubTokenRequestError(responseData.error, error.response.status);
      }

      throw new IdentityHubTokenProtocolError();
    }

    return this.validateTokenResponse(responseData);
  }

  private getClientAuthorizationHeader(): string {
    const clientId = this.configService.getOrThrow('OAUTH_CLIENT_ID', { infer: true });
    const clientSecret = this.configService.getOrThrow('OAUTH_CLIENT_SECRET', { infer: true });
    const credentials = `${this.formEncode(clientId)}:${this.formEncode(clientSecret)}`;

    return `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
  }

  private formEncode(value: string): string {
    const params = new URLSearchParams({ value });
    return params.toString().slice('value='.length);
  }

  private validateTokenResponse(response: IdentityHubTokenResponse): IdentityHubTokenResponse {
    if (
      typeof response?.access_token !== 'string' ||
      response.access_token.length === 0 ||
      typeof response.refresh_token !== 'string' ||
      response.refresh_token.length === 0 ||
      response.token_type !== 'Bearer' ||
      !Number.isInteger(response.expires_in) ||
      response.expires_in <= 0 ||
      !Number.isInteger(response.refresh_token_expires_in) ||
      response.refresh_token_expires_in <= 0
    ) {
      throw new IdentityHubTokenProtocolError();
    }

    return response;
  }

  private getTokenUrl(): string {
    return new URL('oauth/token', this.ensureTrailingSlash(this.getServerToServerBaseUrl())).toString();
  }

  private getIdentitySessionLogoutUrl(): string {
    return new URL('internal/sessions/logout', this.ensureTrailingSlash(this.getServerToServerBaseUrl())).toString();
  }

  private getServerToServerBaseUrl(): string {
    return (
      this.configService.get('IDENTITY_HUB_INTERNAL_URL', { infer: true }) ??
      this.configService.getOrThrow('IDENTITY_HUB_PUBLIC_URL', { infer: true })
    );
  }

  private getRedirectUri(): string {
    const gazettePublicUrl = this.configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true });
    return new URL('/auth/callback', gazettePublicUrl).toString();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
