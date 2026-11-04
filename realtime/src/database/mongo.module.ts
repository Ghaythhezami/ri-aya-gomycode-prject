import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ENV, Env } from '../config/env';
import { MongoConnectionService } from './mongo-connection.service';

/**
 * Connects to MongoDB and declares nothing (FR-012, NFR-003).
 *
 * `lazyConnection` is what keeps an unreachable database from blocking
 * bootstrap: `MongooseModule` creates the connection instead of awaiting it,
 * and readiness reads `readyState` while sockets keep working (AC-016).
 * There is deliberately no `forFeature`, no `@Schema` and no model.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.mongoUri,
        // The driver default is 30 s; a service that blocks that long on an
        // unreachable host fails its health check before it ever answers.
        serverSelectionTimeoutMS: 2_000,
        lazyConnection: true,
      }),
    }),
  ],
  providers: [MongoConnectionService],
  exports: [MongoConnectionService],
})
export class MongoModule {}
