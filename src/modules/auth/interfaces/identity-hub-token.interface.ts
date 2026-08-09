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
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}
