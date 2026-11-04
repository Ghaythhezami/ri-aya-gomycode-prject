import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ENV, loadEnv } from './env';

/**
 * Global configuration (T2.2). `ConfigModule` loads `.env` from the package and
 * the workspace root; the `ENV` provider then validates the merged result once,
 * so every consumer receives the same checked object.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] })],
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}
