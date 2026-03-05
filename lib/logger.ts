/**
 * Structured logger for Workers. Uses pino with a custom destination that
 * writes JSON to console so Cloudflare Workers Logs index fields.
 */
import pino from "pino";

/** Writable that parses pino JSON and logs the object for Workers Logs indexing. */
const workersDest: pino.DestinationStream = {
  write(chunk: string, _enc?: string, cb?: () => void) {
    try {
      const obj = JSON.parse(chunk) as Record<string, unknown>;
      console.log(obj);
    } catch {
      console.log(chunk);
    }
    cb?.();
  },
};

const logger = pino(
  {
    level: "info",
    base: undefined,
    formatters: { level: (label) => ({ level: label }) },
  },
  workersDest
);

export { logger };
