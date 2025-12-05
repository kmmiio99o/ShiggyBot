import { Collection } from "discord.js";
import { SlashCommand } from "./types";
import { PrefixCommand } from "./types";

/**
 * Command registry for ShiggyBot
 * Manages both slash and prefix commands
 */
export class CommandRegistry {
  private slashCommands = new Collection<string, SlashCommand>();
  private prefixCommands = new Collection<string, PrefixCommand>();

  registerSlashCommand(command: SlashCommand) {
    this.slashCommands.set(command.data.name, command);
    console.log(`✅ Registered slash command: ${command.data.name}`);
  }

  registerPrefixCommand(name: string, command: PrefixCommand) {
    this.prefixCommands.set(name, command);
    console.log(`✅ Registered prefix command: ${name}`);
  }

  getSlashCommand(name: string): SlashCommand | undefined {
    return this.slashCommands.get(name);
  }

  getPrefixCommand(name: string): PrefixCommand | undefined {
    return this.prefixCommands.get(name);
  }

  getAllSlashCommands(): SlashCommand[] {
    return Array.from(this.slashCommands.values());
  }

  getAllPrefixCommands(): PrefixCommand[] {
    return Array.from(this.prefixCommands.values());
  }

  /**
   * Registers all commands from modules
   */
  async registerAllCommands() {
    try {
      // Register prefix commands
      const prefixCommands = [
        { name: "ban", module: import("./prefix/commands/moderation/ban") },
        {
          name: "timeout",
          module: import("./prefix/commands/moderation/timeout"),
        },
        { name: "purge", module: import("./prefix/commands/moderation/purge") },
        {
          name: "addrole",
          module: import("./prefix/commands/moderation/addrole"),
        },
        {
          name: "removerole",
          module: import("./prefix/commands/moderation/removerole"),
        },
      ];

      for (const cmd of prefixCommands) {
        try {
          const module = await cmd.module;
          this.registerPrefixCommand(cmd.name, module.default);
        } catch (error) {
          console.error(`❌ Failed to load prefix command ${cmd.name}:`, error);
        }
      }

      console.log(`✅ Loaded ${this.prefixCommands.size} prefix commands`);
    } catch (error) {
      console.error("❌ Error registering commands:", error);
    }
  }
}

// Singleton instance
export const commandRegistry = new CommandRegistry();
