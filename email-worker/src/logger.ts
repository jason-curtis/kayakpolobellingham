/**
 * Structured logger for this worker. Same pattern as root lib/logger.ts:
 * pino with a custom destination so Cloudflare Workers Logs index fields.
 */
import pino from "pino";

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
