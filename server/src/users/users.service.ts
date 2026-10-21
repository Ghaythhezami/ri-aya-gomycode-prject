import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../common/validators/password-strength';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  async createStaffUser(dto: CreateUserDto): Promise<User> {
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

    const user = this.users.create({
      email: dto.email.toLowerCase(),
      passwordHash: await argon2.hash(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      preferredLocale: dto.preferredLocale ?? 'en',
      isActive: true,
    });
    return this.users.save(user);
  }

  save(user: User) {
    return this.users.save(user);
  }
}
