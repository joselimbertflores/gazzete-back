import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { AccessTokenPayload } from 'src/modules/auth/interfaces';
import { PaginationParamsDto } from 'src/modules/common';
import { User } from './entities';
import { UpdateUserDto } from './dtos';

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
      order: {
        createdAt: 'DESC',
      },
    });
    return { users, total };
  }

  async updateRole(id: string, dto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    user.roles = dto.roles;
    return await this.userRepository.save(user);
  }

  async syncUserFromIdentity(payload: AccessTokenPayload) {
    const externalKey = payload.externalKey;
    let user = await this.userRepository.findOne({ where: { externalKey } });

    if (!user) {
      user = this.userRepository.create({ fullName: payload.name, externalKey });
      return await this.userRepository.save(user);
    }

    if (user.fullName !== payload.name) {
      user.fullName = payload.name;
      user = await this.userRepository.save(user);
    }

    return user;
  }
}
