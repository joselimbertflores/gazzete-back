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
