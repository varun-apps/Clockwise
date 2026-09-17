import { type Logger, pino } from "pino";
import { loadSettings } from "./config.js";

let logger: Logger = pino();

export function configureLogging(): void {
  const level = loadSettings().CLOCKWISE_LOG_LEVEL.toLowerCase();
  logger = pino({ level });
}

export function getLogger(name?: string): Logger {
  return name ? logger.child({ name }) : logger;
}
