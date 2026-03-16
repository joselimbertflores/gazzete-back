import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { JwksService } from './jwks.service';
import { AccessTokenPayload } from '../interfaces';

@Injectable()
export class TokenVerifierService {
  constructor(private jwksService: JwksService) {}

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid token header');
    }

    const publicKey = await this.jwksService.getPublicKey(decoded.header.kid);

    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'identity-hub',
      audience: 'sso-clients',
    }) as AccessTokenPayload;
  }
}
