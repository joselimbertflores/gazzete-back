import { createHash } from 'crypto';

import { PkceService } from './pkce.service';

describe('PkceService', () => {
  const service = new PkceService();

  it('generates a valid PKCE code verifier', () => {
    const verifier = service.generateCodeVerifier();

    expect(verifier).toHaveLength(86);
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]+$/);
  });

  it('builds a S256 code challenge', () => {
    const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
    const expectedChallenge = createHash('sha256').update(verifier).digest('base64url');

    expect(service.buildCodeChallenge(verifier)).toBe(expectedChallenge);
  });
});
