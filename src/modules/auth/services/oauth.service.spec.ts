import { ConfigService } from '@nestjs/config';

jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(),
}));

import { OAuthService } from './oauth.service';
import { AuthIdentityService } from './auth-identity.service';
import { TokenVerifierService } from './token-verifier.service';
import { PkceService } from './pkce.service';
import { UsersService } from 'src/modules/users/users.service';
import { EnvironmentVariables } from 'src/config';

describe('OAuthService', () => {
  it('builds an authorize URL with PKCE S256 parameters', () => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          IDENTITY_HUB_URL: 'http://identity.local',
          OAUTH_CLIENT_ID: 'gazette',
          OAUTH_REDIRECT_URI: 'http://gazette.local/auth/callback',
        };
        return values[key];
      }),
    };
    const pkceService = {
      generateCodeVerifier: jest.fn().mockReturnValue('verifier-123'),
      buildCodeChallenge: jest.fn().mockReturnValue('challenge-123'),
    };
    const service = new OAuthService(
      {} as AuthIdentityService,
      {} as UsersService,
      {} as TokenVerifierService,
      configService as unknown as ConfigService<EnvironmentVariables>,
      pkceService as unknown as PkceService,
    );

    const result = service.buildAuthorizeUrl();
    const url = new URL(result.url);

    expect(result.state).toBeTruthy();
    expect(result.codeVerifier).toBe('verifier-123');
    expect(url.toString()).toContain('/oauth/authorize?');
    expect(url.searchParams.get('client_id')).toBe('gazette');
    expect(url.searchParams.get('redirect_uri')).toBe('http://gazette.local/auth/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe(result.state);
    expect(url.searchParams.get('code_challenge')).toBe('challenge-123');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(pkceService.buildCodeChallenge).toHaveBeenCalledWith('verifier-123');
  });
});
