import {
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  PermissionResolvable,
  AutocompleteInteraction,
} from "discord.js";

/**
 * Type definitions for ShiggyBot commands
 */

/**
 * Interface for Slash Commands
 */
export interface SlashCommand {
  /** The command's data, used for registration with Discord. */
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  /** The function to execute when the slash command is called. */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Optional permissions required to use this command. */
  permissions?: PermissionResolvable[];
  /** Optional cooldown in seconds for the command. */
  cooldown?: number;
  /** Optional autocomplete handler for commands with autocompletable options. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Interface for Prefix Commands
 */
export interface PrefixCommand {
  /** The name of the prefix command. */
  name: string;
  /** Optional aliases for the prefix command. */
  aliases?: string[];
  /** A brief description of the prefix command. */
  description: string;
  /** Optional usage instructions for the prefix command. */
  usage?: string;
  /** Optional permissions required to use this command. */
  permissions?: PermissionResolvable[];
  /** Optional cooldown in seconds for the command. */
  cooldown?: number;
  /** The function to execute when the prefix command is called. */
  execute: (message: Message, args: string[]) => Promise<void>;
}
