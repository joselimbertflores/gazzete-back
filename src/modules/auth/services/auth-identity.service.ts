import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';
import { lastValueFrom } from 'rxjs';

import { TokenRequestResponse } from '../interfaces';
import { EnvironmentVariables } from 'src/config';
import { User } from 'src/modules/users/entities';

@Injectable()
export class AuthIdentityService {
  constructor(
    private http: HttpService,
    private configService: ConfigService<EnvironmentVariables>,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async refreshTokens(refreshToken: string) {
    const identityHubUrl = this.configService.getOrThrow<string>('IDENTITY_HUB_URL');
    const tokenUrl = new URL('/oauth/token', identityHubUrl).toString();

    const response = await lastValueFrom(
      this.http.post<TokenRequestResponse>(tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.configService.getOrThrow<string>('OAUTH_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>('OAUTH_CLIENT_SECRET'),
      }),
    );
    return response.data;
  }

  async loadUser(externalKey: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { externalKey },
    });
  }
}
