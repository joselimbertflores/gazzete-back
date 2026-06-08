import { Injectable } from '@nestjs/common';

import { createHash, randomBytes } from 'crypto';

@Injectable()
export class PkceService {
  generateCodeVerifier(): string {
    return randomBytes(64).toString('base64url');
  }

  buildCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }
}
