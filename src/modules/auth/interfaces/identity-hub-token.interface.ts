export interface IdentityHubTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token_expires_in: number;
}

export interface IdentityHubOAuthErrorResponse {
  error: string;
  error_description?: string;
}

export class AccessTokenPayload {
  sub: string;
  externalKey: string;
  name: string;
  userType: string;
  clientId: string;
  scope?: string;
}
