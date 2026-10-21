import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { InitSchema1710000000000 } from './migrations/1710000000000-InitSchema';

loadEnv();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'riaya',
  password: process.env.DB_PASSWORD ?? 'riaya',
  database: process.env.DB_NAME ?? 'riaya',
  entities: [User, RefreshToken, PasswordResetToken],
  migrations: [InitSchema1710000000000],
  synchronize: false,
});
