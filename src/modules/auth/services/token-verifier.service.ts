import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import jwt from 'jsonwebtoken';

import { JwksService } from './jwks.service';
import { AccessTokenPayload } from '../interfaces';
import { EnvironmentVariables } from 'src/config';

@Injectable()
export class TokenVerifierService {
  constructor(
    private readonly jwksService: JwksService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded?.header?.kid) {
        throw new UnauthorizedException('Invalid token header');
      }

      const publicKey = await this.jwksService.getPublicKey(decoded.header.kid);
      const audience = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
      const issuer = this.configService.getOrThrow<string>('OAUTH_ISSUER');

      return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer,
        audience,
      }) as AccessTokenPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
