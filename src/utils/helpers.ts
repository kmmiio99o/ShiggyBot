import { EmbedBuilder, ColorResolvable } from "discord.js";

/**
 * General helper functions for ShiggyBot
 */

/**
 * Creates a standardized embed
 */
export function createEmbed(
  title: string,
  description: string,
  color: ColorResolvable = 0x5865f2,
  options: {
    footer?: string;
    timestamp?: boolean;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  } = {},
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  if (options.timestamp !== false) {
    embed.setTimestamp();
  }

  if (options.fields) {
    embed.addFields(...options.fields);
  }

  return embed;
}

/**
 * Truncates text to a specified length
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix = "...",
): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Formats a duration in milliseconds to a human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Delays execution for a specified time
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capitalizes the first letter of each word
 */
export function capitalize(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Sanitizes user input for Discord
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/@/g, "@\u200b") // Zero-width space after @ to prevent mentions
    .replace(/`/g, "`\u200b") // Prevent code block breaking
    .substring(0, 2000); // Discord message limit
}

/**
 * Parses a time string (e.g., "1h30m") to milliseconds
 */
export function parseTimeString(timeString: string): number | null {
  const regex = /(\d+)([smhd])/g;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(timeString)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case "s":
        totalMs += value * 1000;
        break;
      case "m":
        totalMs += value * 60 * 1000;
        break;
      case "h":
        totalMs += value * 60 * 60 * 1000;
        break;
      case "d":
        totalMs += value * 24 * 60 * 60 * 1000;
        break;
    }
  }

  return totalMs > 0 ? totalMs : null;
}
