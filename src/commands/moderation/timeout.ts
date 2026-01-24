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

    // Normalize args (ensure it's an array)
    args = args || [];

    // Find duration token anywhere in args (e.g. 30s, 10m, 2h, 1d)
    const durationRegex = /^(\d+)(s|m|h|d)$/i;
    const durationIndex = args.findIndex((a) => durationRegex.test(a));
    if (durationIndex === -1) {
      // If used as a reply, still require a duration token
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
**Example:** \`${process.env.PREFIX || "S"}timeout @user 30m Spamming\` (or reply with \`${process.env.PREFIX || "S"}timeout 30m Spamming\`)`,
          ),
        ],
      });
      return;
    }
    const durationToken = args[durationIndex];

    // Resolve target member (mention or ID)
    let target: GuildMember | null = null;

    if (message.reference && message.reference.messageId) {
      // Reply case: try to fetch the referenced message author
      const referenced = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (referenced) {
        target = await message.guild.members
          .fetch(referenced.author.id)
          .catch(() => null);
      }
    }

    // If not a reply or failed to fetch referenced author, check mentions
    if (!target) {
      if (message.mentions.members && message.mentions.members.size > 0) {
        // Use the first mentioned member
        target = message.mentions.members.first() || null;
      } else {
        // Look for an ID-like arg (skip duration token)
        const candidateArg = args.find((a, idx) => {
          if (idx === durationIndex) return false;
          // skip obvious reason words
          return /^\d+$/.test(a) || /^<@!?\d+>$/.test(a) || /^@!?\w+/.test(a);
        });

        if (candidateArg) {
          const id = candidateArg.replace(/[<@!>]/g, "");
          target = await message.guild.members.fetch(id).catch(() => null);
        }
      }
    }

    if (!target) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Member Not Found",
            `❌ Could not find that member in this server.

• Reply to the user's message and include a duration anywhere in the args (e.g. \`${process.env.PREFIX || "S"}timeout 5m reason\`)
• Or mention the user and include a duration anywhere in the args (e.g. \`${process.env.PREFIX || "S"}timeout @user 5m reason\`)
• Or provide their user ID and a duration
• Ensure the member is currently in this server`,
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

    // Parse the duration token
    const matched = durationToken.match(durationRegex);
    if (!matched) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Duration Format",
            `❌ Invalid duration format.

**Valid Formats:** \`30s\`, \`10m\`, \`2h\`, \`1d\`
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

    // Build reason: remove the duration token and any used user token from args, then join the rest
    const argsCopy = args.slice();

    // Remove the duration token (first occurrence)
    const di = argsCopy.findIndex((a) => a === durationToken);
    if (di !== -1) argsCopy.splice(di, 1);

    // Remove the member token if it was present in the args (mention or id)
    // Try to find any arg that matches the target by id or mention form and remove it
    const possibleMemberTokens = new Set<string>();
    possibleMemberTokens.add(`<@${target.id}>`);
    possibleMemberTokens.add(`<@!${target.id}>`);
    possibleMemberTokens.add(target.id);
    // Also allow a plain mention string (sometimes mention parsing varies)
    if (target.user.username)
      possibleMemberTokens.add(`@${target.user.username}`);

    const memberArgIndex = argsCopy.findIndex((a) =>
      possibleMemberTokens.has(a),
    );
    if (memberArgIndex !== -1) argsCopy.splice(memberArgIndex, 1);

    const reason =
      argsCopy.join(" ").trim() || `Timed out by ${message.author.tag}`;

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
