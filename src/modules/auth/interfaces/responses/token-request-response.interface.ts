export interface IdentityHubTokenResponse {
  access_token: string;
  refresh_token: string;
  refresh_token_expires_in: number;
  expires_in: number;
  token_type: string;
}

export interface TokenRequestResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  accessTokenExpiresIn: number;
  tokenType: string;
}

export class AccessTokenPayload {
  sub: string;
  externalKey: string;
  name: string;
  userType: string;
  clientId: string;
  scope?: string;
}
