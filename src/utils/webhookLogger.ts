import https from "https";
import { URL } from "url";

interface LogOptions {
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
}

/**
 * Webhook logger for Discord
 * Sends logs to a Discord webhook for monitoring
 */
class WebhookLogger {
  private webhookUrl?: string;
  private username = "ShiggyBot Logger";
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl;
  }

  setWebhookUrl(url: string) {
    this.webhookUrl = url;
  }

  async info(message: string, context?: Record<string, any>) {
    await this.log({
      level: "INFO",
      message,
      context,
    });
  }

  async warn(message: string, context?: Record<string, any>) {
    await this.log({
      level: "WARN",
      message,
      context,
    });
  }

  async error(error: Error | string, context?: Record<string, any>) {
    await this.log({
      level: "ERROR",
      message: error instanceof Error ? error.message : error,
      error: error instanceof Error ? error : undefined,
      context,
    });
  }

  private async log(options: LogOptions) {
    if (!this.webhookUrl) return;

    const embed = this.createEmbed(options);
    const payload = {
      username: this.username,
      avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
      embeds: [embed],
    };

    await this.sendWithRetry(payload, 0);
  }

  private createEmbed(options: LogOptions): DiscordEmbed {
    const colors = {
      INFO: 0x2ecc71, // Green
      WARN: 0xf39c12, // Orange
      ERROR: 0xe74c3c, // Red
    };

    const embed: DiscordEmbed = {
      title: options.level,
      description: this.truncate(options.message, 2000),
      color: colors[options.level],
      timestamp: new Date().toISOString(),
    };

    // Add error details if present
    if (options.error) {
      if (!embed.fields) embed.fields = [];

      embed.fields.push({
        name: "Stack",
        value: this.truncate(options.error.stack || "No stack trace", 1024),
      });
    }

    // Add context if present
    if (options.context && Object.keys(options.context).length > 0) {
      if (!embed.fields) embed.fields = [];

      for (const [key, value] of Object.entries(options.context)) {
        if (embed.fields.length >= 25) break; // Discord limit
        embed.fields.push({
          name: key,
          value: this.truncate(String(value), 1024),
          inline: true,
        });
      }
    }

    // Add bot info footer
    embed.footer = {
      text: `ShiggyBot v${process.env.npm_package_version || "1.0.0"}`,
    };

    return embed;
  }

  private async sendWithRetry(payload: any, attempt: number): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const parsedUrl = new URL(this.webhookUrl);
      const data = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port || 443,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else if (attempt < this.maxRetries) {
            setTimeout(
              () => {
                this.sendWithRetry(payload, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              },
              this.retryDelay * Math.pow(2, attempt),
            );
          } else {
            console.error(
              `Webhook request failed after ${this.maxRetries} attempts: ${res.statusCode}`,
            );
            resolve(); // Don't reject to avoid crashing
          }
        });

        req.on("error", (error) => {
          if (attempt < this.maxRetries) {
            setTimeout(
              () => {
                this.sendWithRetry(payload, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              },
              this.retryDelay * Math.pow(2, attempt),
            );
          } else {
            console.error("Webhook request error:", error);
            resolve(); // Don't reject
          }
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      console.error("Webhook error:", error);
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }
}

// Singleton instance
export const logger = new WebhookLogger();

// Convenience functions
export const logInfo = (message: string, context?: Record<string, any>) =>
  logger.info(message, context);

export const logWarn = (message: string, context?: Record<string, any>) =>
  logger.warn(message, context);

export const logError = (
  error: Error | string,
  context?: Record<string, any>,
) => logger.error(error, context);

export const initWebhookLogger = (url?: string) => {
  if (url) logger.setWebhookUrl(url);
};

export const attachProcessHandlers = () => {
  process.on("uncaughtException", (error) => {
    logError(error, { type: "uncaughtException" });
    console.error("Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason) => {
    logError(new Error("Unhandled Rejection"), { reason });
    console.error("Unhandled Rejection:", reason);
  });

  process.on("SIGINT", () => {
    logInfo("Process interrupted (SIGINT)");
  });

  process.on("SIGTERM", () => {
    logInfo("Process terminating (SIGTERM)");
  });
};
