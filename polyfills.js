// Import and apply polyfills globally
import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill';

// Make these available globally
globalThis.ReadableStream = ReadableStream;
globalThis.WritableStream = WritableStream;
globalThis.TransformStream = TransformStream;

export { ReadableStream, WritableStream, TransformStream }; 