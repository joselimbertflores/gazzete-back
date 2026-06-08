import type { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(),
}));

import { OAuthController } from './oauth.controller';
import { AuthCookieService, AuthRedirectService, OAuthService } from '../services';

describe('OAuthController', () => {
  let oauthService: {
    buildAuthorizeUrl: jest.Mock;
    completeAuthorizationCodeFlow: jest.Mock;
  };
  let authCookieService: {
    setOAuthTransactionCookies: jest.Mock;
    getOAuthState: jest.Mock;
    getPkceVerifier: jest.Mock;
    clearOAuthTransactionCookies: jest.Mock;
    setAuthCookies: jest.Mock;
  };
  let authRedirectService: {
    buildErrorRedirectUrl: jest.Mock;
    buildSuccessRedirectUrl: jest.Mock;
  };
  let controller: OAuthController;

  beforeEach(() => {
    oauthService = {
      buildAuthorizeUrl: jest.fn().mockReturnValue({
        url: 'http://identity.local/oauth/authorize',
        state: 'state-123',
        codeVerifier: 'verifier-123',
      }),
      completeAuthorizationCodeFlow: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresIn: 60,
        refreshTokenExpiresIn: 3600,
        tokenType: 'Bearer',
      }),
    };
    authCookieService = {
      setOAuthTransactionCookies: jest.fn(),
      getOAuthState: jest.fn().mockReturnValue('state-123'),
      getPkceVerifier: jest.fn().mockReturnValue('verifier-123'),
      clearOAuthTransactionCookies: jest.fn(),
      setAuthCookies: jest.fn(),
    };
    authRedirectService = {
      buildErrorRedirectUrl: jest.fn((error: string) => `/auth/error?error=${error}`),
      buildSuccessRedirectUrl: jest.fn().mockReturnValue('/admin'),
    };
    controller = new OAuthController(
      oauthService as unknown as OAuthService,
      authCookieService as unknown as AuthCookieService,
      authRedirectService as unknown as AuthRedirectService,
    );
  });

  it('sets state and code verifier cookies during login', () => {
    const response = createResponse();

    controller.login(response as unknown as Response);

    expect(authCookieService.setOAuthTransactionCookies).toHaveBeenCalledWith(
      response,
      'state-123',
      'verifier-123',
    );
    expect(response.redirect).toHaveBeenCalledWith('http://identity.local/oauth/authorize');
  });

  it('rejects callback with invalid state before processing an error', async () => {
    const response = createResponse();
    authCookieService.getOAuthState.mockReturnValue('expected-state');

    await controller.callback({} as Request, response as unknown as Response, {
      state: 'wrong-state',
      error: 'access_denied',
    });

    expect(oauthService.completeAuthorizationCodeFlow).not.toHaveBeenCalled();
    expect(authCookieService.clearOAuthTransactionCookies).toHaveBeenCalledWith(response);
    expect(response.redirect).toHaveBeenCalledWith('/auth/error?error=invalid_state');
  });

  it('rejects callback without a PKCE verifier', async () => {
    const response = createResponse();
    authCookieService.getPkceVerifier.mockReturnValue(undefined);

    await controller.callback({} as Request, response as unknown as Response, {
      state: 'state-123',
      code: 'code-123',
    });

    expect(oauthService.completeAuthorizationCodeFlow).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith('/auth/error?error=missing_code_verifier');
  });

  it('exchanges code with verifier and sets auth cookies on success', async () => {
    const response = createResponse();

    await controller.callback({} as Request, response as unknown as Response, {
      state: 'state-123',
      code: 'code-123',
    });

    expect(oauthService.completeAuthorizationCodeFlow).toHaveBeenCalledWith('code-123', 'verifier-123');
    expect(authCookieService.clearOAuthTransactionCookies).toHaveBeenCalledWith(response);
    expect(authCookieService.setAuthCookies).toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith('/admin');
  });

  it('logs only sanitized OAuth callback failure details', async () => {
    const response = createResponse();
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const sensitiveError = Object.assign(new Error('client_secret=secret code_verifier=verifier-123'), {
      code: 'ECONNRESET',
      response: { status: 502 },
    });
    sensitiveError.stack = 'Error: accessToken=access refreshToken=refresh password=secret';
    oauthService.completeAuthorizationCodeFlow.mockRejectedValueOnce(sensitiveError);

    await controller.callback({} as Request, response as unknown as Response, {
      state: 'state-123',
      code: 'code-123',
    });

    expect(loggerSpy).toHaveBeenCalledWith('OAuth callback failed during token exchange or user synchronization', {
      errorType: 'Error',
      message: 'OAuth callback processing failed',
      status: 502,
      code: 'ECONNRESET',
    });
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain('client_secret');
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain('code_verifier');
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain('accessToken');
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain('refreshToken');
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain('password');
    expect(response.redirect).toHaveBeenCalledWith('/auth/error?error=token_exchange_failed');

    loggerSpy.mockRestore();
  });
});

function createResponse() {
  return {
    redirect: jest.fn(),
  };
}
