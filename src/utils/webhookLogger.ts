import https from "https";
import { URL } from "url";

/**
 * Simple Discord webhook logger utility.
 *
 * Usage:
 *   import { initWebhookLogger, logError, logWarn, logInfo, attachProcessHandlers } from '../utils/webhookLogger';
 *   initWebhookLogger(process.env.LOG_WEBHOOK_URL);
 *   logInfo("Started", { shard: 1 });
 *
 * This module avoids external dependencies and sends POST requests directly to Discord's
 * webhook endpoint using the Node https module. It implements simple retries and truncation
 * for long messages to avoid embed size limits.
 */

/* Configuration */
let WEBHOOK_URL: string | undefined = process.env.LOG_WEBHOOK_URL;

/* Defaults */
const DEFAULT_USERNAME = "ShiggyBot-Logger";
const MAX_FIELD_VALUE = 1024; // Discord embed field limit for value
const MAX_EMBED_DESCRIPTION = 4096;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // base delay for retries

/**
 * Initialize logger with an explicit webhook URL.
 * If not called, the module will fall back to `process.env.LOG_WEBHOOK_URL`.
 */
export function initWebhookLogger(url?: string) {
  if (url) WEBHOOK_URL = url;
}

/* Internal helper: make HTTPS POST to webhook URL */
async function postToWebhook(payload: any, attempts = 0): Promise<void> {
  const urlStr = WEBHOOK_URL;
  if (!urlStr) {
    // No webhook configured; nothing to do.
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    // invalid URL -> bail out
    // eslint-disable-next-line no-console
    console.error("webhookLogger: invalid webhook URL", err);
    return;
  }

  const data = JSON.stringify(payload);

  const options: https.RequestOptions = {
    method: "POST",
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "User-Agent": "ShiggyBot-WebhookLogger/1.0",
    },
    port: parsed.port ? Number(parsed.port) : undefined,
  };

  await new Promise<void>((resolve) => {
    const req = https.request(options, (res) => {
      // Consume response to free socket
      res.on("data", () => {});
      res.on("end", () => {
        // Consider 2xx codes success
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          // Retry on server errors
          if (attempts < MAX_RETRIES) {
            setTimeout(() => {
              postToWebhook(payload, attempts + 1)
                .then(() => resolve())
                .catch(() => resolve());
            }, RETRY_DELAY_MS * Math.pow(2, attempts));
          } else {
            // eslint-disable-next-line no-console
            console.error(
              `webhookLogger: request failed status=${res.statusCode}`
            );
            resolve();
          }
        }
      });
    });

    req.on("error", (err) => {
      if (attempts < MAX_RETRIES) {
        setTimeout(() => {
          postToWebhook(payload, attempts + 1)
            .then(() => resolve())
            .catch(() => resolve());
        }, RETRY_DELAY_MS * Math.pow(2, attempts));
      } else {
        // eslint-disable-next-line no-console
        console.error("webhookLogger: request error", err);
        resolve();
      }
    });

    req.write(data);
    req.end();
  });
}

/* Helpers to build embeds safely (truncate long content) */
function truncate(input: string | undefined, max: number) {
  if (!input) return "";
  if (input.length <= max) return input;
  return input.slice(0, max - 3) + "...";
}

function buildBasicEmbed(
  title: string,
  description?: string,
  color = 0xff5555
) {
  const embed: any = {
    title,
    description: description
      ? truncate(description, MAX_EMBED_DESCRIPTION)
      : undefined,
    color,
    timestamp: new Date().toISOString(),
    fields: [],
  };
  return embed;
}

/* Format error details into embed fields */
function errorToEmbed(err: unknown, context?: Record<string, any>) {
  const embed = buildBasicEmbed("Error", undefined, 0xff3333);
  const errMsg =
    err && (err as any).message
      ? String((err as any).message)
      : String(err ?? "Unknown error");
  const stack =
    err && (err as any).stack ? String((err as any).stack) : undefined;

  embed.description = truncate(errMsg, MAX_EMBED_DESCRIPTION);

  if (stack) {
    embed.fields.push({
      name: "Stack",
      value: truncate(stack, MAX_FIELD_VALUE),
    });
  }

  if (context && Object.keys(context).length > 0) {
    try {
      const ctx =
        typeof context === "string"
          ? String(context)
          : JSON.stringify(context, null, 2);
      embed.fields.push({
        name: "Context",
        value: truncate(ctx, MAX_FIELD_VALUE),
      });
    } catch {
      // ignore JSON errors
    }
  }

  return embed;
}

/* Public API */

/**
 * Log an error to the webhook. `err` can be an Error or any value.
 * Optional `context` can include additional metadata (guildId, userId, command, etc).
 */
export async function logError(err: unknown, context?: Record<string, any>) {
  const embed = errorToEmbed(err, context);
  const payload = {
    username: DEFAULT_USERNAME,
    embeds: [embed],
  };
  await postToWebhook(payload);
}

/**
 * Log a warning message with optional context.
 */
export async function logWarn(message: string, context?: Record<string, any>) {
  const embed = buildBasicEmbed("Warning", message, 0xffaa00);
  if (context && Object.keys(context).length > 0) {
    try {
      embed.fields.push({
        name: "Context",
        value: truncate(JSON.stringify(context, null, 2), MAX_FIELD_VALUE),
      });
    } catch {
      // ignore
    }
  }
  const payload = { username: DEFAULT_USERNAME, embeds: [embed] };
  await postToWebhook(payload);
}

/**
 * Log an informational message.
 */
export async function logInfo(message: string, context?: Record<string, any>) {
  const embed = buildBasicEmbed("Info", message, 0x33cc33);
  if (context && Object.keys(context).length > 0) {
    try {
      embed.fields.push({
        name: "Context",
        value: truncate(JSON.stringify(context, null, 2), MAX_FIELD_VALUE),
      });
    } catch {
      // ignore
    }
  }
  const payload = { username: DEFAULT_USERNAME, embeds: [embed] };
  await postToWebhook(payload);
}

/**
 * Attach process-wide handlers for uncaught exceptions and unhandled rejections.
 * This will post to the configured webhook when such events occur.
 */
export function attachProcessHandlers() {
  process.on("uncaughtException", (err) => {
    // Fire-and-forget; logging should not crash the process
    logError(err, { type: "uncaughtException" }).catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    logError(reason, { type: "unhandledRejection" }).catch(() => {});
  });

  // Optional: graceful warnings on SIGTERM / SIGINT
  process.on("SIGINT", () => {
    logInfo("Process interrupted (SIGINT)").catch(() => {});
  });
  process.on("SIGTERM", () => {
    logInfo("Process terminating (SIGTERM)").catch(() => {});
  });
}

/* Default export - convenience object */
export default {
  init: initWebhookLogger,
  error: logError,
  warn: logWarn,
  info: logInfo,
  attachHandlers: attachProcessHandlers,
};
