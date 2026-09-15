import type { JwtPayload } from 'jsonwebtoken';

export interface IdentityHubTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token_expires_in: number;
}

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  externalKey: string;
  name: string;
  sid: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface LogoutTokenPayload extends JwtPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  sid: string;
  events: Record<string, unknown>;
}
