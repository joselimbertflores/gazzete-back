import { ConflictException } from '@nestjs/common';

import { QueryFailedError, Repository } from 'typeorm';

import { IdentityHubAssignableUser, IdentityHubUsersClientService } from './identity-hub-users-client.service';
import { User, UserRole } from './entities';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let identityHubUsersClient: {
    findAssignableUserByExternalKey: jest.Mock;
    searchAssignableUsers: jest.Mock;
  };
  let userRepository: {
    create: jest.Mock;
    exists: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    identityHubUsersClient = {
      findAssignableUserByExternalKey: jest.fn(),
      searchAssignableUsers: jest.fn(),
    };
    userRepository = {
      create: jest.fn((user: Partial<User>) => user),
      exists: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((user: User) => user),
    };
    service = new UsersService(
      userRepository as unknown as Repository<User>,
      identityHubUsersClient as unknown as IdentityHubUsersClientService,
    );
  });

  it('rejects an import when the external key already exists locally', async () => {
    userRepository.findOne.mockResolvedValue(createLocalUser());

    await expect(
      service.importFromIdentity({
        externalKey: 'IDH-U-01',
        roles: [UserRole.ADMIN],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(identityHubUsersClient.findAssignableUserByExternalKey).not.toHaveBeenCalled();
  });

  it('imports only the local shadow fields', async () => {
    userRepository.findOne.mockResolvedValue(null);
    identityHubUsersClient.findAssignableUserByExternalKey.mockResolvedValue(createIdentityUser());

    await service.importFromIdentity({
      externalKey: 'IDH-U-01',
      roles: [UserRole.ADMIN],
    });

    expect(userRepository.create).toHaveBeenCalledWith({
      externalKey: 'IDH-U-01',
      fullName: 'Ada Lovelace',
      roles: [UserRole.ADMIN],
    });
  });

  it('syncs the display name without overwriting local roles', async () => {
    const user = createLocalUser({ fullName: 'Previous Name', roles: [UserRole.ADMIN] });
    userRepository.findOne.mockResolvedValue(user);
    await service.syncUserFromIdentity(createAccessTokenPayload());

    expect(userRepository.save).toHaveBeenCalledWith({
      ...user,
      fullName: 'Ada Lovelace',
      roles: [UserRole.ADMIN],
    });
  });

  it('does not update the shadow user when the display name has not changed', async () => {
    const user = createLocalUser({ fullName: 'Ada Lovelace', roles: [UserRole.ADMIN] });
    userRepository.findOne.mockResolvedValue(user);

    await service.syncUserFromIdentity(createAccessTokenPayload());

    expect(userRepository.save).not.toHaveBeenCalled();
    expect(user.roles).toEqual([UserRole.ADMIN]);
  });

  it('creates a JIT shadow user with only the default local role', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await service.syncUserFromIdentity(createAccessTokenPayload());

    expect(userRepository.create).toHaveBeenCalledWith({
      externalKey: 'IDH-U-01',
      fullName: 'Ada Lovelace',
      roles: [UserRole.USER],
    });
  });

  it('returns the shadow user created by a concurrent JIT request', async () => {
    const existingUser = createLocalUser({ roles: [UserRole.ADMIN] });
    userRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);
    userRepository.save.mockRejectedValue(createUniqueViolation());

    const user = await service.syncUserFromIdentity(createAccessTokenPayload());

    expect(user).toBe(existingUser);
    expect(user.roles).toEqual([UserRole.ADMIN]);
    expect(identityHubUsersClient.findAssignableUserByExternalKey).not.toHaveBeenCalled();
  });

  it('does not create a bootstrap admin when a local admin already exists', async () => {
    userRepository.exists.mockResolvedValue(true);

    await expect(service.bootstrapInitialAdmin('IDH-U-01')).resolves.toEqual({
      status: 'admin-already-exists',
    });
    expect(userRepository.findOne).not.toHaveBeenCalled();
    expect(identityHubUsersClient.findAssignableUserByExternalKey).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('does not promote an existing local user during admin bootstrap', async () => {
    userRepository.exists.mockResolvedValue(false);
    userRepository.findOne.mockResolvedValue(createLocalUser());

    await expect(service.bootstrapInitialAdmin('IDH-U-01')).rejects.toBeInstanceOf(ConflictException);
    expect(identityHubUsersClient.findAssignableUserByExternalKey).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('creates the initial local admin with only shadow user fields', async () => {
    userRepository.exists.mockResolvedValue(false);
    userRepository.findOne.mockResolvedValue(null);
    identityHubUsersClient.findAssignableUserByExternalKey.mockResolvedValue(createIdentityUser());

    await expect(service.bootstrapInitialAdmin('IDH-U-01')).resolves.toEqual({
      status: 'created',
      user: {
        externalKey: 'IDH-U-01',
        fullName: 'Ada Lovelace',
        roles: [UserRole.ADMIN],
      },
    });
    expect(userRepository.create).toHaveBeenCalledWith({
      externalKey: 'IDH-U-01',
      fullName: 'Ada Lovelace',
      roles: [UserRole.ADMIN],
    });
  });
});

function createAccessTokenPayload() {
  return {
    externalKey: 'IDH-U-01',
    name: 'Ada Lovelace',
  } as never;
}

function createIdentityUser(): IdentityHubAssignableUser {
  return {
    externalKey: 'IDH-U-01',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    login: 'ada',
  };
}

function createLocalUser(overrides: Partial<User> = {}): User {
  return {
    id: 'local-user-id',
    externalKey: 'IDH-U-01',
    fullName: 'Ada Lovelace',
    roles: [UserRole.USER],
    ...overrides,
  } as User;
}

function createUniqueViolation(): QueryFailedError {
  return new QueryFailedError('', [], { code: '23505' } as Error & { code: string });
}
