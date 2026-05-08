import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

import { JwksClient } from 'jwks-rsa';

import { EnvironmentVariables } from 'src/config';

@Injectable()
export class JwksService {
  private readonly client: JwksClient;

  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');

    const jwksUri = new URL('.well-known/jwks.json', this.ensureTrailingSlash(identityHubUrl)).toString();

    this.client = new JwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    });
  }

  async getPublicKey(kid: string): Promise<string> {
    const key = await this.client.getSigningKey(kid);
    return key.getPublicKey();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
