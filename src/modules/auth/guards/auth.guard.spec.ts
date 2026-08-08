import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(),
}));

import { OAuthGuard } from './auth.guard';
import { AuthCookieService, AuthSessionService, TokenVerifierService } from '../services';
import { UserRole } from 'src/modules/users/entities';

describe('OAuthGuard', () => {
  it('accepts an existing local shadow user through the opaque local session', async () => {
    const request = { cookies: {} };
    const response = {};
    const authCookieService = {
      getSessionId: jest.fn().mockReturnValue('session-id'),
      clearSessionCookie: jest.fn(),
    };
    const tokenVerifierService = {
      verifyAccessToken: jest.fn().mockResolvedValue({ externalKey: 'IDH-U-01' }),
    };
    const authSessionService = {
      findActiveSession: jest.fn().mockResolvedValue({
        id: 'session-id',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'local-user-id',
          externalKey: 'IDH-U-01',
          fullName: 'Ada Lovelace',
          roles: [UserRole.USER],
        },
      }),
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new OAuthGuard(
      reflector as unknown as Reflector,
      authSessionService as unknown as AuthSessionService,
      authCookieService as unknown as AuthCookieService,
      tokenVerifierService as unknown as TokenVerifierService,
    );

    await expect(guard.canActivate(createContext(request, response))).resolves.toBe(true);
    expect(authCookieService.clearSessionCookie).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: {
        externalKey: 'IDH-U-01',
        roles: [UserRole.USER],
      },
    });
  });
});

function createContext(request: object, response: object): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
      getResponse: jest.fn().mockReturnValue(response),
    }),
  } as unknown as ExecutionContext;
}
