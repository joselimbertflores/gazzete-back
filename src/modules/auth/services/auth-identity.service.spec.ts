import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { of } from 'rxjs';

import { EnvironmentVariables } from 'src/config';
import { AuthIdentityService } from './auth-identity.service';

describe('AuthIdentityService', () => {
  it('sends code_verifier when exchanging an authorization code', async () => {
    const http = {
      post: jest.fn().mockReturnValue(
        of({
          data: {
            accessToken: 'access',
            refreshToken: 'refresh',
            accessTokenExpiresIn: 60,
            refreshTokenExpiresIn: 3600,
            tokenType: 'Bearer',
          },
        }),
      ),
    };
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          IDENTITY_HUB_URL: 'http://identity.local',
          OAUTH_REDIRECT_URI: 'http://gazette.local/auth/callback',
          OAUTH_CLIENT_ID: 'gazette',
          OAUTH_CLIENT_SECRET: 'secret',
        };
        return values[key];
      }),
    };
    const service = new AuthIdentityService(
      http as unknown as HttpService,
      configService as unknown as ConfigService<EnvironmentVariables>,
    );

    await service.exchangeAuthorizationCode('code-123', 'verifier-123');

    expect(http.post).toHaveBeenCalledWith('http://identity.local/oauth/token', {
      grant_type: 'authorization_code',
      code: 'code-123',
      redirect_uri: 'http://gazette.local/auth/callback',
      client_id: 'gazette',
      client_secret: 'secret',
      code_verifier: 'verifier-123',
    });
  });
});
