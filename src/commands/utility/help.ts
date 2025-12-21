import { Message, EmbedBuilder } from "discord.js";
import { PrefixCommand } from "../types";
import { commandRegistry } from "../index";
import { config } from "../../config";

/**
 * Utility: help + about in a single module.
 *
 * - Default export is the `help` command so the loader registers it normally.
 * - `aboutCommand` is registered as a side-effect on module import so it also
 *   becomes available as a prefix command (this keeps both commands in one file
 *   while preserving the project's loader expectations).
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

/* ------------------------------- About Cmd ------------------------------ */

export const aboutCommand: PrefixCommand = {
  name: "about",
  description: "Information about the bot (version, config, runtime).",
  usage: "",
  async execute(message: Message) {
    const prefix = commandRegistry?.prefix ?? config.prefix ?? "S";

    const uptimeSec = Math.floor(process.uptime());
    const uptime = `${Math.floor(uptimeSec / 3600)}h ${Math.floor(
      (uptimeSec % 3600) / 60,
    )}m ${uptimeSec % 60}s`;

    const embed = new EmbedBuilder()
      .setTitle("About ShiggyBot")
      .setColor(0x7289da)
      .setDescription(
        "A modular Discord bot. Use the prefix below to run prefix commands.",
      )
      .addFields(
        { name: "Prefix", value: `\`${prefix}\``, inline: true },
        {
          name: "Client ID",
          value: `${config.clientId || "N/A"}`,
          inline: true,
        },
        {
          name: "Uptime",
          value: uptime,
          inline: true,
        },
        {
          name: "Node",
          value: `${process.version} on ${process.platform}/${process.arch}`,
          inline: false,
        },
      )
      .setFooter({
        text: `Requested by ${message.author.tag}`,
      });

    await message.reply({ embeds: [embed] }).catch(() => {});
  },
};

/* Register aboutCommand as a side-effect so the loader (which registers only the default export)
   still picks up this extra command when this module is imported. */
try {
  // Avoid double-registration if loader re-imports modules.
  if (!commandRegistry.getPrefixCommand(aboutCommand.name)) {
    commandRegistry.registerPrefixCommand(aboutCommand);
  }
} catch {
  // If commandRegistry isn't available for some reason at import time, ignore.
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
        .setColor(0x00b894)
        .addFields(
          {
            name: "Description",
            value: `${cmd.description || "No description."}`,
          },
          {
            name: "Usage",
            value: `\`${prefix}${cmd.usage ?? cmd.name + ""}\``,
          },
        );

      if (cmd.aliases && cmd.aliases.length > 0) {
        embed.addFields({
          name: "Aliases",
          value: cmd.aliases.map((a: string) => `\`${a}\``).join(", "),
        });
      }

      if (cmd.permissions && cmd.permissions.length > 0) {
        // permissions might be a complex object; stringify conservatively
        embed.addFields({
          name: "Permissions",
          value: Array.isArray(cmd.permissions)
            ? cmd.permissions.map((p: any) => `\`${String(p)}\``).join(", ")
            : `\`${String(cmd.permissions)}\``,
        });
      }

      await message.reply({ embeds: [embed] }).catch(() => {});
      return;
    }

    // Otherwise, list all commands
    const allCommands = commandRegistry
      .getAllPrefixCommands()
      .sort((a, b) => a.name.localeCompare(b.name));

    if (allCommands.length === 0) {
      await message
        .reply("No prefix commands are currently registered.")
        .catch(() => {});
      return;
    }

    const lines = allCommands.map((c) => {
      const usage = c.usage ? ` ${c.usage}` : "";
      return `\`${prefix}${c.name}${usage}\` — ${c.description ?? "No description."}`;
    });

    const chunks = chunkLines(lines, 1024);

    const embeds = chunks.map((chunk, i) => {
      const e = new EmbedBuilder()
        .setTitle(i === 0 ? "Available Commands" : `Commands (cont.)`)
        .setColor(0x3498db)
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
        await message.channel.send({ embeds: [embeds[i]] }).catch(() => {});
      }
    } catch {
      // ignore send errors
    }
  },
};

export default helpCommand;
