import { Collection } from "discord.js";
import { SlashCommand, PrefixCommand } from "./types";
import { config } from "../config";
import path from "path";
import fs from "fs/promises";

/**
 * Command registry for ShiggyBot
 * Manages both slash and prefix commands, loading them dynamically
 */
export class CommandRegistry {
  private slashCommands = new Collection<string, SlashCommand>();
  private prefixCommands = new Collection<string, PrefixCommand>();

  /**
   * Registers a single slash command.
   * @param command The SlashCommand object to register.
   */
  registerSlashCommand(command: SlashCommand) {
    this.slashCommands.set(command.data.name, command);
    console.log(`✅ Registered slash command: ${command.data.name}`);
  }

  /**
   * Registers a single prefix command.
   * @param command The PrefixCommand object to register.
   */
  registerPrefixCommand(command: PrefixCommand) {
    this.prefixCommands.set(command.name, command);
    if (command.aliases) {
      command.aliases.forEach((alias) =>
        this.prefixCommands.set(alias, command),
      );
    }
    console.log(`✅ Registered prefix command: ${command.name}`);
  }

  /**
   * Retrieves a slash command by its name.
   * @param name The name of the slash command.
   * @returns The SlashCommand object or undefined if not found.
   */
  getSlashCommand(name: string): SlashCommand | undefined {
    return this.slashCommands.get(name);
  }

  /**
   * Retrieves a prefix command by its name or alias.
   * @param name The name or alias of the prefix command.
   * @returns The PrefixCommand object or undefined if not found.
   */
  getPrefixCommand(name: string): PrefixCommand | undefined {
    return this.prefixCommands.get(name);
  }

  /**
   * Returns all registered slash commands.
   * @returns An array of SlashCommand objects.
   */
  getAllSlashCommands(): SlashCommand[] {
    return Array.from(this.slashCommands.values());
  }

  /**
   * Returns all registered prefix commands.
   * Note: This will return unique command instances, not including aliases as separate entries.
   * @returns An array of PrefixCommand objects.
   */
  getAllPrefixCommands(): PrefixCommand[] {
    const uniqueCommands = new Collection<string, PrefixCommand>();
    this.prefixCommands.forEach((cmd) => uniqueCommands.set(cmd.name, cmd));
    return Array.from(uniqueCommands.values());
  }

  /**
   * Dynamically loads and registers all commands from specified directories.
   */
  async registerAllCommands() {
    console.log("🚀 Starting command registration...");

    // Define the base path for commands
    const commandsBasePath = path.join(__dirname);

    // Load Slash Commands
    const slashCommandsDir = path.join(commandsBasePath, "slash");
    try {
      const slashCommandFiles = await fs.readdir(slashCommandsDir);
      for (const file of slashCommandFiles) {
        if (file.endsWith(".ts") || file.endsWith(".js")) {
          try {
            const commandPath = path.join(slashCommandsDir, file);
            const command: SlashCommand = (await import(commandPath)).default;
            if (command && command.data) {
              this.registerSlashCommand(command);
            } else {
              console.warn(
                `⚠️ Slash command file ${file} does not export a valid SlashCommand.`,
              );
            }
          } catch (error) {
            console.error(
              `❌ Failed to load slash command from ${file}:`,
              error,
            );
          }
        }
      }
      console.log(`✅ Loaded ${this.slashCommands.size} slash commands.`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.warn(
          `⚠️ Slash commands directory not found: ${slashCommandsDir}`,
        );
      } else {
        console.error("❌ Error loading slash commands:", error);
      }
    }

    // Load Prefix Commands
    const prefixCommandsDir = path.join(commandsBasePath, "prefix");
    try {
      const moderationCommandsDir = path.join(prefixCommandsDir, "moderation");
      const moderationCommandFiles = await fs.readdir(moderationCommandsDir);

      for (const file of moderationCommandFiles) {
        if (file.endsWith(".ts") || file.endsWith(".js")) {
          try {
            const commandPath = path.join(moderationCommandsDir, file);
            const command: PrefixCommand = (await import(commandPath)).default;
            if (command && command.name) {
              this.registerPrefixCommand(command);
            } else {
              console.warn(
                `⚠️ Prefix command file ${file} does not export a valid PrefixCommand.`,
              );
            }
          } catch (error) {
            console.error(
              `❌ Failed to load prefix command from ${file}:`,
              error,
            );
          }
        }
      }
      console.log(
        `✅ Loaded ${this.getAllPrefixCommands().length} unique prefix commands (including aliases: ${this.prefixCommands.size}).`,
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.warn(
          `⚠️ Prefix commands directory not found: ${prefixCommandsDir}`,
        );
      } else {
        console.error("❌ Error loading prefix commands:", error);
      }
    }

    console.log("✨ Command registration complete.");
  }

  /**
   * The prefix for commands, obtained from the configuration.
   */
  get prefix(): string {
    return config.prefix;
  }
}

// Singleton instance of the CommandRegistry
export const commandRegistry = new CommandRegistry();
