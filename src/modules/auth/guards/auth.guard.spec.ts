import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(),
}));

import { OAuthGuard } from './auth.guard';
import { AuthCookieService, AuthIdentityService, TokenVerifierService } from '../services';
import { UsersService } from 'src/modules/users/users.service';
import { UserRole } from 'src/modules/users/entities';

describe('OAuthGuard', () => {
  it('accepts an existing local shadow user without checking local activation', async () => {
    const request = { cookies: {} };
    const response = {};
    const authCookieService = {
      getAccessToken: jest.fn().mockReturnValue('access-token'),
      getRefreshToken: jest.fn().mockReturnValue(undefined),
      clearAuthCookies: jest.fn(),
    };
    const tokenVerifierService = {
      verifyAccessToken: jest.fn().mockResolvedValue({ externalKey: 'IDH-U-01' }),
    };
    const usersService = {
      findByExternalKey: jest.fn().mockResolvedValue({
        id: 'local-user-id',
        externalKey: 'IDH-U-01',
        fullName: 'Ada Lovelace',
        roles: [UserRole.USER],
      }),
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new OAuthGuard(
      reflector as unknown as Reflector,
      {} as AuthIdentityService,
      usersService as unknown as UsersService,
      authCookieService as unknown as AuthCookieService,
      tokenVerifierService as unknown as TokenVerifierService,
    );

    await expect(guard.canActivate(createContext(request, response))).resolves.toBe(true);
    expect(authCookieService.clearAuthCookies).not.toHaveBeenCalled();
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
