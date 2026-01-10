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
    const name =
      (command && (command as any).data?.name) || (command as any).name;
    if (!name) {
      console.warn(
        "⚠️ Tried to register a slash command without a name",
        command,
      );
      return;
    }
    this.slashCommands.set(name, command);
    console.log(`✅ Registered slash command: ${name}`);
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
   * The prefix for commands, obtained from the configuration.
   */
  get prefix(): string {
    return config.prefix;
  }

  /**
   * Recursively read directory and return list of files (non-directories)
   */
  private async readDirRecursive(baseDir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(baseDir, entry.name);
        if (entry.isDirectory()) {
          const nested = await this.readDirRecursive(full);
          results.push(...nested);
        } else if (entry.isFile()) {
          // consider only .ts and .js files (ignore .d.ts etc)
          if (full.endsWith(".ts") || full.endsWith(".js")) {
            results.push(full);
          }
        }
      }
    } catch (err: any) {
      // Propagate ENOENT so callers can handle non-existing directories
      throw err;
    }
    return results;
  }

  /**
   * Dynamically loads and registers all commands from specified directories.
   *
   * This implementation is more robust than a fixed layout: it will attempt to
   * discover commands under multiple common layouts:
   *  - src/commands/slash
   *  - src/commands/prefix/*
   *  - src/commands/moderation, src/commands/search, src/commands/utility
   *  - nested folders under src/commands/
   *
   * It tolerates missing directories and logs helpful messages.
   */
  async registerAllCommands() {
    console.log("🚀 Starting command registration...");

    const commandsBasePath = path.join(__dirname);

    // Candidate roots to scan for prefix commands
    const prefixCandidateDirs = [
      path.join(commandsBasePath, "prefix"),
      path.join(commandsBasePath, "moderation"),
      path.join(commandsBasePath, "search"),
      path.join(commandsBasePath, "utility"),
      // Also accept a nested commands/prefix or commands/moderation if someone put them there
      path.join(commandsBasePath, "commands", "prefix"),
      path.join(commandsBasePath, "commands", "moderation"),
    ];

    // Candidate roots to scan for slash commands
    const slashCandidateDirs = [
      path.join(commandsBasePath, "slash"),
      path.join(commandsBasePath, "commands", "slash"),
    ];

    let totalSlashRegistered = 0;
    let totalPrefixRegistered = 0;

    // Helper to load modules and extract exported command object
    const extractCommand = (mod: any) => {
      if (!mod) return undefined;
      // Prefer default export, then named exports that look like commands, then module itself
      if (
        mod.default &&
        (typeof mod.default === "object" || typeof mod.default === "function")
      ) {
        return mod.default;
      }
      // Some modules export named command objects (e.g., export const command = ...). Try common keys.
      const candidateKeys = [
        "command",
        "default",
        "defaultCommand",
        "defaultExport",
      ];
      for (const key of candidateKeys) {
        if (mod[key]) return mod[key];
      }
      return mod;
    };

    // Load slash commands
    for (const dir of slashCandidateDirs) {
      try {
        const files = await this.readDirRecursive(dir).catch((e) => {
          if (e && e.code === "ENOENT") {
            // directory missing — skip, but let caller know if none found at end
            return [];
          }
          throw e;
        });
        if (files.length === 0) {
          // continue searching other slashCandidateDirs
          continue;
        }

        for (const file of files) {
          try {
            const imported = await import(file);
            const command = extractCommand(imported) as
              | SlashCommand
              | undefined;
            if (command && (command as any).data) {
              this.registerSlashCommand(command);
              totalSlashRegistered++;
            } else {
              console.warn(
                `⚠️ Slash command file ${file} does not export a valid SlashCommand.`,
              );
            }
          } catch (err) {
            console.error(`❌ Failed to load slash command from ${file}:`, err);
          }
        }

        // If we successfully discovered slash files in this candidate dir,
        // don't continue to other slashCandidateDirs to avoid duplicate work.
        if (files.length > 0) break;
      } catch (err) {
        // tolerate and continue to other candidate dirs
        console.warn(`⚠️ Error scanning slash commands dir ${dir}:`, err);
      }
    }

    if (totalSlashRegistered === 0) {
      console.warn(`⚠️ No slash commands found to register.`);
    }

    // Load prefix commands
    const seenPrefixFiles = new Set<string>();
    for (const dir of prefixCandidateDirs) {
      try {
        const files = await this.readDirRecursive(dir).catch((e) => {
          if (e && e.code === "ENOENT") return [];
          throw e;
        });
        if (files.length === 0) {
          continue;
        }

        for (const file of files) {
          // Avoid loading the same file twice if directories overlap
          if (seenPrefixFiles.has(file)) continue;
          seenPrefixFiles.add(file);

          try {
            const imported = await import(file);
            const command = extractCommand(imported) as
              | PrefixCommand
              | undefined;
            if (
              command &&
              typeof command.execute === "function" &&
              (command as any).name
            ) {
              this.registerPrefixCommand(command);
              totalPrefixRegistered++;
            } else {
              console.warn(
                `⚠️ Prefix command file ${file} does not export a valid PrefixCommand.`,
              );
            }
          } catch (err) {
            console.error(
              `❌ Failed to load prefix command from ${file}:`,
              err,
            );
          }
        }
      } catch (err) {
        console.warn(`⚠️ Error scanning prefix commands dir ${dir}:`, err);
      }
    }

    // As a fallback, scan the whole commandsBasePath non-recursively for files directly in commands/
    // (this helps if people put commands directly under src/commands)
    if (totalPrefixRegistered === 0) {
      try {
        const directFiles = await fs.readdir(commandsBasePath);
        for (const f of directFiles) {
          const full = path.join(commandsBasePath, f);
          if (
            (f.endsWith(".ts") || f.endsWith(".js")) &&
            !seenPrefixFiles.has(full)
          ) {
            try {
              const imported = await import(full);
              const command = extractCommand(imported) as
                | PrefixCommand
                | undefined;
              if (
                command &&
                typeof command.execute === "function" &&
                (command as any).name
              ) {
                this.registerPrefixCommand(command);
                totalPrefixRegistered++;
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    console.log(`✨ Command registration complete.`);
  }
}

// Singleton instance of the CommandRegistry
export const commandRegistry = new CommandRegistry();
