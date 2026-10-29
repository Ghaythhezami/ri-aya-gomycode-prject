import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { CreateUserDto } from './dto/create-user.dto';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';
import type { UserRecord } from './user.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async findByEmail(email: string) {
    const normalized = email.toLowerCase();
    const cached = await this.cache.get<UserRecord>(`user:email:${normalized}`);
    if (cached) return cached;
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (user) await this.cache.set(`user:email:${normalized}`, user, 30);
    return user;
  }

  async findById(id: string) {
    const cached = await this.cache.get<UserRecord>(`user:id:${id}`);
    if (cached) return cached;
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user) await this.cache.set(`user:id:${id}`, user, 30);
    return user;
  }

  async createStaffUser(dto: CreateUserDto): Promise<UserRecord> {
    if (!isStrongPassword(dto.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_MESSAGE,
      });
    }

    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
      });
    }

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        preferredLocale: dto.preferredLocale ?? 'en',
        isActive: true,
      },
    });
  }

  async save(user: UserRecord) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: user.passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        preferredLocale: user.preferredLocale,
        lastLoginAt: user.lastLoginAt,
        failedLoginCount: user.failedLoginCount,
        failedLoginWindowStart: user.failedLoginWindowStart,
        lockedUntil: user.lockedUntil,
      },
    });
    await this.cache.del(`user:id:${user.id}`);
    await this.cache.del(`user:email:${user.email}`);
    return updated;
  }
}
