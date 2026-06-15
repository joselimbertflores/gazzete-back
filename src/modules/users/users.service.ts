import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ArrayContains, ILike, QueryFailedError, Repository } from 'typeorm';

import { IdentityHubUsersClientService } from './identity-hub-users-client.service';
import { ImportUserFromIdentityDto, UpdateUserDto } from './dtos';
import { AccessTokenPayload } from 'src/modules/auth/interfaces';
import { PaginationParamsDto } from 'src/modules/common';
import { User, UserRole } from './entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly identityHubUsersClient: IdentityHubUsersClientService,
  ) {}

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

  async findByExternalKey(externalKey: string) {
    return this.userRepository.findOne({ where: { externalKey } });
  }

  searchIdentityCandidates(term: string) {
    return this.identityHubUsersClient.searchAssignableUsers(term);
  }

  findIdentityCandidateByExternalKey(externalKey: string) {
    return this.identityHubUsersClient.findAssignableUserByExternalKey(externalKey);
  }

  async importFromIdentity(dto: ImportUserFromIdentityDto) {
    await this.ensureExternalKeyIsAvailable(dto.externalKey);

    const identityUser = await this.identityHubUsersClient.findAssignableUserByExternalKey(dto.externalKey);

    if (identityUser.externalKey !== dto.externalKey) {
      throw new BadGatewayException(
        'El servicio de usuarios devolvió un identificador externo diferente al solicitado.',
      );
    }

    const user = this.userRepository.create({
      externalKey: identityUser.externalKey,
      fullName: identityUser.fullName,
      roles: dto.roles,
    });

    try {
      return await this.userRepository.save(user);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('El usuario ya existe en este cliente.');
      }

      throw error;
    }
  }

  async bootstrapInitialAdmin(externalKey: string) {
    const hasLocalAdmin = await this.userRepository.exists({
      where: { roles: ArrayContains([UserRole.ADMIN]) },
    });

    if (hasLocalAdmin) {
      return { status: 'admin-already-exists' as const };
    }

    const existingUser = await this.findByExternalKey(externalKey);

    if (existingUser) {
      throw new ConflictException(
        `El usuario local con externalKey ${externalKey} ya existe y no es ADMIN. No fue promovido.`,
      );
    }

    const identityUser = await this.identityHubUsersClient.findAssignableUserByExternalKey(externalKey);

    if (identityUser.externalKey !== externalKey) {
      throw new BadGatewayException(
        'El servicio de usuarios devolvió un identificador externo diferente al solicitado.',
      );
    }

    const user = this.userRepository.create({
      externalKey: identityUser.externalKey,
      fullName: identityUser.fullName,
      roles: [UserRole.ADMIN],
    });

    try {
      return { status: 'created' as const, user: await this.userRepository.save(user) };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('El usuario ya existe en este cliente.');
      }

      throw error;
    }
  }

  async syncUserFromIdentity(payload: AccessTokenPayload) {
    const externalKey = payload.externalKey;
    const fullName = payload.name;
    let user = await this.findByExternalKey(externalKey);

    if (!user) {
      user = this.userRepository.create({
        fullName,
        externalKey,
        roles: [UserRole.USER],
      });

      try {
        return await this.userRepository.save(user);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;

        const existingUser = await this.findByExternalKey(externalKey);
        if (existingUser) return existingUser;

        throw error;
      }
    }

    let shouldSave = false;

    if (user.fullName !== fullName) {
      user.fullName = fullName;
      shouldSave = true;
    }

    if (shouldSave) {
      user = await this.userRepository.save(user);
    }

    return user;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  private async ensureExternalKeyIsAvailable(externalKey: string) {
    const existingUser = await this.findByExternalKey(externalKey);

    if (existingUser) {
      throw new ConflictException('El usuario ya existe en este cliente.');
    }
  }
}
