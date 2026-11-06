// jest-environment-jsdom does not expose these Node globals; react-router needs them.
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
