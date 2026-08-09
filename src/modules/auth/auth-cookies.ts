import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'gazette_session';
export const OAUTH_TRANSACTION_COOKIE_NAME = 'gazette_oauth_transaction';
export const OAUTH_TRANSACTION_COOKIE_PATH = '/auth';

export function usesSecureAuthCookies(publicUrl: string): boolean {
  return new URL(publicUrl).protocol === 'https:';
}

export function getAuthCookieOptions(secure: boolean, path = '/'): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path,
  };
}
