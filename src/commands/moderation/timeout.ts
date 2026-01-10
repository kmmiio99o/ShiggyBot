import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  Colors,
} from "discord.js";
import { PrefixCommand } from "../types";

const timeoutCommand: PrefixCommand = {
  name: "timeout",
  description:
    "Temporarily timeout/mute a member. Format: Stimeout @user 10m [reason]",
  usage: "<user> <duration> [reason]",
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    if (!message.guild) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Command Error",
            "❌ This command can only be used in a server.",
          ),
        ],
      });
      return;
    }

    const executor = message.member;
    const botMember = message.guild.members.me;

    if (!executor) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Command Error",
            "❌ Could not resolve your guild member information.",
          ),
        ],
      });
      return;
    }

    // Permission checks
    if (!executor.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Permission Denied",
            "❌ You need the `Moderate Members` permission to timeout members.",
          ),
        ],
      });
      return;
    }

    if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Bot Permission Error",
            "❌ I need the `Moderate Members` permission to apply timeouts.",
          ),
        ],
      });
      return;
    }

    if (!message.reference) {
      // Not a reply: require both user and duration
      if (!args[0] || !args[1]) {
        await message.reply({
          embeds: [
            createErrorEmbed(
              "Usage Error",
              `❌ Please provide both a user and duration.

**Usage:** \`${process.env.PREFIX || "S"}timeout @user <duration> [reason]\`
**Duration Examples:** \`30s\`, \`10m\`, \`2h\`, \`1d\`
**Maximum:** 28 days
**Example:** \`${process.env.PREFIX || "S"}timeout @user 30m Spamming\``,
            ),
          ],
        });
        return;
      }
    } else {
      // Is a reply: require at least a duration (args[0])
      if (!args[0]) {
        await message.reply({
          embeds: [
            createErrorEmbed(
              "Usage Error",
              `❌ Please provide a duration when using this command as a reply.

**Usage:** \`${process.env.PREFIX || "S"}timeout <duration> [reason]\` (reply to the user)
**Duration Examples:** \`30s\`, \`10m\`, \`2h\`, \`1d\`
**Maximum:** 28 days
**Example:** \`${process.env.PREFIX || "S"}timeout 30m Spamming\` (reply to the user)`,
            ),
          ],
        });
        return;
      }
    }

    // Resolve target member (mention or ID)
    let target: GuildMember | null = null;
    let durationArgIndex = 1;
    if (message.mentions.members && message.mentions.members.size > 0) {
      target = message.mentions.members.first() || null;
      durationArgIndex = 1;
    } else if (message.reference && message.reference.messageId) {
      // If the command was used as a reply, fetch the replied-to message and use its author
      const referenced = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (referenced) {
        target = await message.guild.members
          .fetch(referenced.author.id)
          .catch(() => null);
        durationArgIndex = 0;
      }
    } else {
      const id = args[0] ? args[0].replace(/[<@!>]/g, "") : "";
      target = id
        ? await message.guild.members.fetch(id).catch(() => null)
        : null;
      durationArgIndex = 1;
    }

    if (!target) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Member Not Found",
            `❌ Could not find that member in this server.

• Mention the user directly
• Or provide their user ID
• Ensure they are currently in this server`,
          ),
        ],
      });
      return;
    }

    // Prevent self, bot, or server owner timeouts
    if (target.id === message.author.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ You cannot timeout yourself."),
        ],
      });
      return;
    }
    if (target.id === message.client.user?.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ I cannot timeout myself."),
        ],
      });
      return;
    }
    if (target.id === message.guild.ownerId) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Target",
            "❌ You cannot timeout the server owner.",
          ),
        ],
      });
      return;
    }

    // Role hierarchy checks
    const executorHighest = executor.roles.highest?.position ?? 0;
    const targetHighest = target.roles.highest?.position ?? 0;
    const botHighest = botMember?.roles.highest?.position ?? 0;

    if (
      message.guild.ownerId !== message.author.id &&
      executorHighest <= targetHighest
    ) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Hierarchy",
            "❌ You cannot timeout this member because they have an equal or higher role than you.",
          ),
        ],
      });
      return;
    }

    if (botHighest <= targetHighest) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Bot Role Hierarchy",
            "❌ I cannot timeout this member because their role is higher than (or equal to) mine.",
          ),
        ],
      });
      return;
    }

    // Parse duration token (duration may be at args[1] normally, or args[0] if replying)
    const durationToken = args[durationArgIndex];
    if (!durationToken) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Duration Format",
            `❌ Invalid duration format.

**Valid Formats:** \`30s\`, \`10m\`, \`2h\`, \`1d\`
• \`s\` = seconds
• \`m\` = minutes
• \`h\` = hours
• \`d\` = days
**Example:** \`${process.env.PREFIX || "S"}timeout @user 30m Spamming\``,
          ),
        ],
      });
      return;
    }
    const matched = durationToken.match(/^(\d+)(s|m|h|d)$/i);
    if (!matched) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Duration Format",
            `❌ Invalid duration format.

**Valid Formats:** \`30s\`, \`10m\`, \`2h\`, \`1d\`
• \`s\` = seconds
• \`m\` = minutes
• \`h\` = hours
• \`d\` = days
**Example:** \`${process.env.PREFIX || "S"}timeout @user 30m Spamming\``,
          ),
        ],
      });
      return;
    }

    const value = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    let ms = 0;
    switch (unit) {
      case "s":
        ms = value * 1000;
        break;
      case "m":
        ms = value * 60 * 1000;
        break;
      case "h":
        ms = value * 60 * 60 * 1000;
        break;
      case "d":
        ms = value * 24 * 60 * 60 * 1000;
        break;
      default:
        ms = 0;
    }

    if (ms <= 0) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Duration",
            "❌ Invalid duration. Use a positive duration like 30s, 10m, 2h, 1d.",
          ),
        ],
      });
      return;
    }

    // Discord caps timeouts at 28 days
    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    const appliedMs = Math.min(ms, MAX_TIMEOUT_MS);

    const reason =
      args
        .slice(durationArgIndex + 1)
        .join(" ")
        .trim() || `Timed out by ${message.author.tag}`;

    try {
      // Use GuildMember.timeout (discord.js v14) — duration in ms
      await target.timeout(appliedMs, `${reason} — by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setTitle("⏰ Member Timed Out")
        .setColor(Colors.Orange)
        .setDescription(`${target.user.tag} has been put in timeout.`)
        .addFields(
          { name: "👤 Member", value: target.user.tag, inline: true },
          { name: "🆔 ID", value: target.id, inline: true },
          { name: "🛡️ Moderator", value: message.author.tag, inline: true },
          {
            name: "⏱️ Duration",
            value: formatDuration(appliedMs),
            inline: true,
          },
          {
            name: "⏰ Expires",
            value: `<t:${Math.floor((Date.now() + appliedMs) / 1000)}:R>`,
            inline: true,
          },
          { name: "📝 Reason", value: reason, inline: false },
        )
        .setThumbnail(target.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Action performed by ${message.author.tag}` });

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Failed to apply timeout:", err);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Timeout Failed",
            "❌ Failed to apply timeout. Ensure:\n• I have permission to timeout members\n• The member is eligible for timeout\n• My role is higher than the target's role",
          ),
        ],
      });
    }
  },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day(s)`;
  if (hours > 0) return `${hours} hour(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;
  return `${seconds} second(s)`;
}

export default timeoutCommand;
