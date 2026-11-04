import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DependencyStatus } from '../common/dependency-status';

/**
 * Reports MongoDB's connection state without ever querying it (FR-012, NFR-003).
 *
 * There is no model in this package, so this connection is the entire Mongo
 * surface. A failure is a readiness signal, not a reason to crash: the socket
 * server keeps serving (AC-016, EC-004).
 */
@Injectable()
export class MongoConnectionService {
  private readonly logger = new Logger(MongoConnectionService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {
    // Attached in the constructor, before the async connect can fail, so a
    // driver error is logged instead of surfacing as an unhandled `error` event.
    this.connection.on('error', (error: Error) => {
      this.logger.warn(`MongoDB unavailable: ${error.name}`);
    });
  }

  get status(): DependencyStatus {
    return this.connection.readyState === 1 ? 'up' : 'down';
  }
}
