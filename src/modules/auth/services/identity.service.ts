import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { Repository } from 'typeorm';
import { lastValueFrom } from 'rxjs';

import { TokenRequestResponse } from '../interfaces';
import { EnvironmentVariables } from 'src/config';
import { User } from 'src/modules/users/entities';

@Injectable()
export class IdentityService {
  constructor(
    private http: HttpService,
    private configService: ConfigService<EnvironmentVariables>,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  async refreshTokens(refreshToken: string) {
    const url = `${this.configService.get('IDENTITY_HUB_URL')}/oauth/token`;
    const response = await lastValueFrom(
      this.http.post<TokenRequestResponse>(url, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.configService.getOrThrow<string>('CLIENT_KEY'),
        client_secret: this.configService.getOrThrow<string>('CLIENT_SECRET'),
      }),
    );
    return response.data;
  }

  async loadUser(externalKey: string) {
    const user = await this.userRepository.findOne({ where: { externalKey } });
    if (!user) throw new ForbiddenException('Not user fount.');
    return user;
  }
}
