import { Message, EmbedBuilder, Colors } from "discord.js";
import { PrefixCommand } from "../types";
import { commandRegistry } from "../index";
import { config } from "../../config";

/**
 * Help command
 *
 * This module exports only the `help` prefix command. It lists all registered
 * prefix commands or shows detailed information for a single command.
 */

/* ----------------------------- Helper Utils ----------------------------- */

function chunkLines(lines: string[], maxLen = 1024): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if ((current + line + "\n").length > maxLen) {
      if (current.length > 0) chunks.push(current.trimEnd());
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.length > 0) chunks.push(current.trimEnd());
  return chunks;
}

/* ------------------------------- Help Cmd ------------------------------- */

const helpCommand: PrefixCommand = {
  name: "help",
  aliases: ["commands"],
  description:
    "Lists all available prefix commands or shows detailed help for one command.",
  usage: "[command]",
  async execute(message: Message, args: string[]) {
    const prefix = commandRegistry?.prefix ?? config.prefix ?? "S";

    // If a specific command requested, show detailed usage
    const target = args[0]?.toLowerCase();
    if (target) {
      const cmd = commandRegistry.getPrefixCommand(target);
      if (!cmd) {
        await message
          .reply(
            `❌ Unknown command: \`${prefix}${target}\`. Use \`${prefix}help\` to list commands.`,
          )
          .catch(() => {});
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Help: ${prefix}${(cmd as any).name}`)
        .setColor(Colors.Green)
        .addFields(
          {
            name: "Description",
            value: `${cmd.description || "No description."}`,
          },
          {
            name: "Usage",
            value: `\`${prefix}${(cmd.usage ?? cmd.name) || cmd.name}\``,
          },
        );

      if (cmd.aliases && cmd.aliases.length > 0) {
        embed.addFields({
          name: "Aliases",
          value: cmd.aliases.map((a: string) => `\`${a}\``).join(", "),
        });
      }

      if (cmd.permissions && (cmd.permissions as any).length > 0) {
        embed.addFields({
          name: "Permissions",
          value: Array.isArray(cmd.permissions)
            ? (cmd.permissions as any)
                .map((p: any) => `\`${String(p)}\``)
                .join(", ")
            : `\`${String(cmd.permissions)}\``,
        });
      }

      embed.setFooter({
        text: `Use ${prefix}help <command> for detailed info.`,
      });

      await message.reply({ embeds: [embed] }).catch(() => {});
      return;
    }

    // Otherwise, list all commands
    let allCommands = commandRegistry.getAllPrefixCommands() || [];

    // If no commands are registered yet (e.g. during early startup), attempt to
    // load/register prefix commands on-demand. We call the registry's loader
    // method if present and then re-query the registry.
    if (!allCommands || allCommands.length === 0) {
      try {
        const maybeLoader = (commandRegistry as any).registerAllCommands;
        if (typeof maybeLoader === "function") {
          // registerAllCommands is async — await it so the registry is populated
          await maybeLoader.call(commandRegistry);
          // Re-fetch commands after attempting registration
          allCommands = commandRegistry.getAllPrefixCommands() || [];
        }
      } catch {
        // Ignore any errors while attempting on-demand registration and fall
        // through to the no-commands response below.
      }
    }

    if (!allCommands || allCommands.length === 0) {
      await message
        .reply("No prefix commands are currently registered.")
        .catch(() => {});
      return;
    }

    allCommands = allCommands.sort((a, b) => a.name.localeCompare(b.name));

    // Only show command names in the main list. For full details use:
    //   shelp <command>
    const lines = allCommands.map((c) => `**${c.name}**`);

    const chunks = chunkLines(lines, 1024);

    const embeds = chunks.map((chunk, i) => {
      const e = new EmbedBuilder()
        .setTitle(i === 0 ? "Available Commands" : "Commands (cont.)")
        .setColor(Colors.Blue)
        .setDescription(chunk)
        .setFooter({
          text: `Use ${prefix}help <command> for detailed info.`,
        });
      return e;
    });

    // Reply with the first embed; if there are multiple, follow up with additional messages
    try {
      await message.reply({ embeds: [embeds[0]] }).catch(() => {});
      for (let i = 1; i < embeds.length; i++) {
        await (message.channel as any)
          .send({ embeds: [embeds[i]] })
          .catch(() => {});
      }
    } catch {
      // ignore send errors
    }
  },
};

export default helpCommand;
