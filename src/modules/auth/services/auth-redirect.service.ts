import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from 'src/config';

@Injectable()
export class AuthRedirectService {
  private readonly successPath = 'admin';
  private readonly errorPath = 'auth/error';

  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  buildSuccessRedirectUrl(): string {
    return this.buildFrontendUrl(this.successPath);
  }

  buildErrorRedirectUrl(error: string): string {
    return this.buildFrontendUrl(this.errorPath, { error });
  }

  private buildFrontendUrl(path: string, params?: Record<string, string | undefined>): string {
    const uiBaseUrl = this.configService.get<string>('GAZETTE_UI_BASE_URL');

    if (!uiBaseUrl) {
      const searchParams = new URLSearchParams();

      for (const [key, value] of Object.entries(params ?? {})) {
        if (value) {
          searchParams.set(key, value);
        }
      }

      const queryString = searchParams.toString();
      return queryString ? `/${path}?${queryString}` : `/${path}`;
    }

    const url = new URL(path, this.ensureTrailingSlash(uiBaseUrl));

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
