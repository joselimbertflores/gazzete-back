import { Injectable } from '@nestjs/common';
import { JwksClient } from 'jwks-rsa';
@Injectable()
export class JwksService {
  private client = new JwksClient({
    jwksUri: process.env.IDENTITY_HUB_URL + '/.well-known/jwks.json',
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
  });

  async getPublicKey(kid: string): Promise<string> {
    const key = await this.client.getSigningKey(kid);
    return key.getPublicKey();
  }
}
