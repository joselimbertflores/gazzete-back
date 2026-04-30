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
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid token header');
    }

    const publicKey = await this.jwksService.getPublicKey(decoded.header.kid);

    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'identity-hub',
      audience: this.configService.getOrThrow<string>('CLIENT_KEY'),
    }) as AccessTokenPayload;
  }
}
