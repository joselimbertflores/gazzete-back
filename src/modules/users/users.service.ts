import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { AccessTokenPayload } from 'src/modules/auth/interfaces';
import { PaginationParamsDto } from 'src/modules/common';
import { User } from './entities';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepository: Repository<User>) {}

  async findAll({ limit, offset, term }: PaginationParamsDto) {
    const [users, total] = await this.userRepository.findAndCount({
      take: limit,
      skip: offset,
      ...(term && {
        where: { fullName: ILike(`%${term}%`) },
      }),
      relations: { roles: true },
      order: {
        createdAt: 'DESC',
      },
    });
    return { users, total };
  }

  async syncUserFromIdentity(payload: AccessTokenPayload, defaultRole?: string) {
    const externalKey = payload.externalKey;
    let user = await this.userRepository.findOne({ where: { externalKey } });
    if (!user) {
      user = this.userRepository.create({ fullName: payload.name, externalKey });
      return await this.userRepository.save(user);
    }
    return user;
  }
}
