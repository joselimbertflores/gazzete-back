import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isAxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';

import { EnvironmentVariables } from 'src/config';

export interface IdentityHubAssignableUser {
  externalKey: string;
  fullName: string;
  email: string | null;
  login: string;
}

@Injectable()
export class IdentityHubUsersClientService {
  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async searchAssignableUsers(term: string): Promise<IdentityHubAssignableUser[]> {
    const url = this.buildUrl('/internal/users/assignable');
    url.searchParams.set('term', term);

    try {
      const response = await lastValueFrom(
        this.http.get<IdentityHubAssignableUser[]>(url.toString(), {
          auth: this.getBasicAuth(),
        }),
      );
      return response.data;
    } catch {
      throw new BadGatewayException('Unable to search assignable users in Identity Hub');
    }
  }

  async findAssignableUserByExternalKey(externalKey: string): Promise<IdentityHubAssignableUser> {
    const url = this.buildUrl(`/internal/users/assignable/${encodeURIComponent(externalKey)}`);

    try {
      const response = await lastValueFrom(
        this.http.get<IdentityHubAssignableUser>(url.toString(), {
          auth: this.getBasicAuth(),
        }),
      );
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException(`Assignable Identity Hub user with external key ${externalKey} not found`);
      }

      throw new BadGatewayException('Unable to load assignable user from Identity Hub');
    }
  }

  private buildUrl(path: string): URL {
    // Internal Hub URL is server-to-server; browser redirects use IDENTITY_HUB_URL.
    const identityHubInternalUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_INTERNAL_URL');
    return new URL(path, this.ensureTrailingSlash(identityHubInternalUrl));
  }

  private getBasicAuth() {
    return {
      username: this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
      password: this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET'),
    };
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
