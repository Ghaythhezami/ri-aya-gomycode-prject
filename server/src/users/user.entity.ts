import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.enum';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';

export type PreferredLocale = 'en' | 'ar' | 'fr';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'simple-enum', enum: UserRole })
  role!: UserRole;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 2, default: 'en' })
  preferredLocale!: PreferredLocale;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ default: 0 })
  failedLoginCount!: number;

  @Column({ type: 'datetime', nullable: true })
  failedLoginWindowStart!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];

  @OneToMany(() => PasswordResetToken, (token) => token.user)
  passwordResetTokens!: PasswordResetToken[];
}
