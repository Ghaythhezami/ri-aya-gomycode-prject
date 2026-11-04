/**
 * File-backed sink used by the logging tests (BP-003).
 *
 * `nestjs-pino` 5.x builds its pino-http instance through `pinoHttp(params)`,
 * so a `stream` or `destination` option passed to `LoggerModule.forRoot` is not
 * read and the sink cannot be redirected that way. The one knob the library
 * does honour is pino's own `transport`, which references this module by path.
 *
 * Nothing in production imports this file: `LoggingModule` only points at it
 * when `LOG_TRANSPORT_TARGET` is set, and that variable exists in the test
 * process alone. Without it the app logs to stdout exactly as documented.
 */
import { appendFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';

/** Absolute path of the file the test transport appends to. */
const LOG_FILE = join(tmpdir(), `riaya-app-log-${process.pid}.jsonl`);

/** One line per record, JSON-encoded. */
export const fileLogTarget = (destination: string | number) => {
  // pino imports this module on its worker thread, where Jest's ts-jest
  // transform is not installed. ts-node is a dev dependency of the server and
  // is the only way that worker can load a .ts transport.
  createRequire(pathToFileURL(join(process.cwd(), 'package.json')).href)('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
  });

  void destination;

  // pino's worker pipes raw JSON chunks straight into the returned value, so
  // it has to be a real `Writable`: a plain EventEmitter never receives data.
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      appendFileSync(LOG_FILE, `${chunk.toString().trimEnd()}\n`);
      callback();
    },
  });
};

/** pino imports the default export as the transport's worker. */
export default fileLogTarget;

/** Path the test suite reads from; also what `LoggingModule` passes to pino. */
export const AppLogStream = {
  path: LOG_FILE,
  reset: () => {
    if (existsSync(LOG_FILE)) {
      rmSync(LOG_FILE, { force: true });
    }
  },
};

/**
 * Every JSON record written so far.
 *
 * A partially written last line is skipped rather than parsed: the transport
 * appends asynchronously, so a reader can land mid-line.
 */
export function readAppLog(): Promise<Record<string, unknown>[]> {
  if (!existsSync(AppLogStream.path)) {
    return Promise.resolve([]);
  }

  return Promise.resolve(
    readFileSync(AppLogStream.path, 'utf8')
      .split('\n')
      .flatMap((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return [];
        }

        try {
          const parsed: unknown = JSON.parse(trimmed);

          return parsed && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : [];
        } catch {
          return [];
        }
      }),
  );
}
