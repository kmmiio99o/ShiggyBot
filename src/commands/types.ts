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

export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  permissions?: PermissionResolvable[];
  cooldown?: number;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface PrefixCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  permissions?: PermissionResolvable[];
  cooldown?: number;
  execute: (message: Message, args: string[]) => Promise<void>;
}
