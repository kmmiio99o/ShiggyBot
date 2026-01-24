import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  User,
  Colors,
} from "discord.js";
import { PrefixCommand } from "../types";

const banCommand: PrefixCommand = {
  name: "ban",
  description: "Ban a server member immediately.",
  usage: '<user> [deleteTime] [reason...]  (examples: "7d", "30min", "0")',
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    // Only allowed in guilds
    if (!message.guild) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Command Error",
            "❌ This command can only be used in a server (guild).",
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
    if (!executor.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Permission Denied",
            "❌ You need the `Ban Members` permission to use this command.",
          ),
        ],
      });
      return;
    }

    // Bot permission check
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Bot Permission Error",
            "❌ I do not have the `Ban Members` permission. Please grant it to me and try again.",
          ),
        ],
      });
      return;
    }

    // Normalize args
    args = args || [];

    // Determine target user id and optionally the GuildMember if present
    let targetUserId: string | null = null;
    let targetMember: GuildMember | null = null;
    let targetUser: User | null = null;

    // if the command is a reply, prefer the referenced message author
    if (message.reference && message.reference.messageId) {
      const referenced = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (referenced) {
        targetUserId = referenced.author.id;
        // try to resolve guild member (may be null if user left)
        targetMember = await message.guild.members
          .fetch(targetUserId)
          .catch(() => null);
        targetUser = referenced.author;
      }
    }

    // if not resolved from reply, check mentions or first arg as ID
    if (!targetUserId) {
      if (message.mentions && message.mentions.users.size > 0) {
        const u = message.mentions.users.first()!;
        targetUserId = u.id;
        targetUser = u;
        targetMember = message.guild.members.cache.get(u.id) ?? null;
      } else if (args[0]) {
        // treat args[0] as an ID/mention candidate
        const candidate = args[0].replace(/[<@!>]/g, "");
        if (/^\d{16,20}$/.test(candidate)) {
          // looks like an ID
          targetUserId = candidate;
          // try to fetch member; may fail if not in guild
          targetMember = await message.guild.members
            .fetch(candidate)
            .catch(() => null);
          // try to fetch global user (useful for embed fields)
          targetUser = await message.client.users
            .fetch(candidate)
            .catch(() => null);
        } else {
          // not an id-like token and not a mention -> will fall through and error later
          targetUserId = null;
        }
      }
    }

    if (!targetUserId) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "User Not Found",
            `❌ Could not determine the target user.

• Reply to the user's message and run \`${process.env.PREFIX || "S"}ban <deleteTime?> [reason]\`
• Or mention the user / provide their ID: \`${process.env.PREFIX || "S"}ban @user 7d Spamming\`
• You may also ban users not on server by ID: \`${process.env.PREFIX || "S"}ban 123456789012345678 7d Reason\``,
          ),
        ],
      });
      return;
    }

    // Prevent self / bot / owner banning
    if (targetUserId === message.author.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ You cannot ban yourself."),
        ],
      });
      return;
    }
    if (targetUserId === message.client.user?.id) {
      await message.reply({
        embeds: [createErrorEmbed("Invalid Target", "❌ I cannot ban myself.")],
      });
      return;
    }
    if (targetUserId === message.guild.ownerId) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Target",
            "❌ You cannot ban the server owner.",
          ),
        ],
      });
      return;
    }

    // If we have a guild member, perform role hierarchy checks
    if (targetMember) {
      const executorHighest = executor.roles.highest?.position ?? 0;
      const targetHighest = targetMember.roles.highest?.position ?? 0;
      const botHighest = botMember?.roles.highest?.position ?? 0;

      if (
        executorHighest <= targetHighest &&
        message.guild.ownerId !== message.author.id
      ) {
        await message.reply({
          embeds: [
            createErrorEmbed(
              "Role Hierarchy",
              "❌ You cannot ban this member because they have an equal or higher role than you.",
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
              "❌ I cannot ban this member because their highest role is higher than (or equal to) mine.",
            ),
          ],
        });
        return;
      }
    }

    // Parse delete-time token from args (flexible position)
    // Valid tokens: number optionally followed by unit (s/sec/secs, m/min/mins, h/hr/hrs, d/day/days)
    const timeRegex = /^(\d+)(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)?$/i;

    // When used as reply, the first arg is likely deleteTime; otherwise the deleteTime might be at args[1]
    // We'll scan args for the first token that matches timeRegex (but skip the token that we used as user id in non-reply case)
    let argsForScan = args.slice();
    // If we used args[0] as the ID/mention, remove it from scan so it's not mistaken for a time token
    if (
      !(message.reference && message.reference.messageId) &&
      message.mentions.users.size === 0 &&
      argsForScan.length > 0
    ) {
      // We consumed args[0] as the target id when not using reply/mention
      argsForScan = argsForScan.slice(1);
    }

    const timeIndex = argsForScan.findIndex((a) => timeRegex.test(a));
    let deleteMessageSeconds = 0;
    let displayDeleteTime = "0";
    let consumedIndicesInOriginal: number[] = []; // we'll remove used tokens from original args for reason building

    if (timeIndex !== -1) {
      // map back to original args index
      let originalIndex = timeIndex;
      if (
        !(message.reference && message.reference.messageId) &&
        message.mentions.users.size === 0 &&
        args.length > 0
      ) {
        originalIndex = timeIndex + 1;
      }
      const token = args[originalIndex].toLowerCase();
      const match = token.match(timeRegex);
      if (match) {
        const num = Number(match[1]);
        const unit = (match[2] || "d").toLowerCase();
        let seconds = 0;
        if (["s", "sec", "secs"].includes(unit)) {
          seconds = num;
        } else if (["m", "min", "mins"].includes(unit)) {
          seconds = num * 60;
        } else if (["h", "hr", "hrs"].includes(unit)) {
          seconds = num * 60 * 60;
        } else {
          // days
          seconds = num * 24 * 60 * 60;
        }

        // Discord allows up to 7 days for message deletion on ban (limit historically)
        const maxSeconds = 7 * 24 * 60 * 60;
        if (seconds > maxSeconds) seconds = maxSeconds;

        deleteMessageSeconds = seconds;
        displayDeleteTime =
          deleteMessageSeconds === 0
            ? "0"
            : deleteMessageSeconds % (24 * 60 * 60) === 0
              ? `${deleteMessageSeconds / (24 * 60 * 60)} day(s)`
              : deleteMessageSeconds % 3600 === 0
                ? `${deleteMessageSeconds / 3600} hour(s)`
                : deleteMessageSeconds % 60 === 0
                  ? `${deleteMessageSeconds / 60} minute(s)`
                  : `${deleteMessageSeconds} second(s)`;

        consumedIndicesInOriginal.push(originalIndex);
      }
    }

    // Reason: build from args excluding the consumed user token (if any) and the time token
    const argsCopyForReason = args.slice();

    // Remove user arg if we consumed args[0] as the user (non-reply non-mention)
    if (
      !(message.reference && message.reference.messageId) &&
      message.mentions.users.size === 0 &&
      argsCopyForReason.length > 0
    ) {
      // we used args[0] to determine targetUserId earlier
      argsCopyForReason.shift();
    }

    // Remove any time token we consumed (first occurrence in argsCopyForReason that matches timeRegex)
    const timeTokenIdxInCopy = argsCopyForReason.findIndex((a) =>
      timeRegex.test(a),
    );
    if (timeTokenIdxInCopy !== -1) {
      argsCopyForReason.splice(timeTokenIdxInCopy, 1);
    }

    const reason =
      argsCopyForReason.join(" ").trim() || `Banned by ${message.author.tag}`;

    // Ensure we have a User object (for embeds). Try to fetch if absent.
    if (!targetUser) {
      targetUser = await message.client.users
        .fetch(targetUserId)
        .catch(() => null);
    }

    try {
      // use Guild bans.create
      await message.guild.bans.create(targetUserId, {
        deleteMessageSeconds: deleteMessageSeconds,
        reason: `${reason} — banned by ${message.author.tag}`,
      });

      const success = new EmbedBuilder()
        .setTitle("✅ User Banned")
        .setColor(Colors.Green)
        .setDescription(
          `${targetUser ? targetUser.tag : targetUserId} has been banned from the server.`,
        )
        .addFields(
          {
            name: "👤 Member",
            value: `${targetUser ? targetUser.tag : targetUserId}`,
            inline: true,
          },
          { name: "🆔 ID", value: targetUserId, inline: true },
          {
            name: "🛡️ Moderator",
            value: `${message.author.tag}`,
            inline: true,
          },
          {
            name: "🗑️ Deleted Messages",
            value: displayDeleteTime,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: reason || "No reason provided",
            inline: false,
          },
        )
        .setThumbnail(targetUser ? targetUser.displayAvatarURL() : null)
        .setTimestamp()
        .setFooter({ text: `Action performed by ${message.author.tag}` });

      // If command was used as a reply and we have the referenced message, reply to that message for context.
      if (message.reference && message.reference.messageId) {
        const referenced = await message.channel.messages
          .fetch(message.reference.messageId)
          .catch(() => null);
        if (referenced) {
          await referenced.reply({ embeds: [success] }).catch(() => {});
          return;
        }
      }

      await message.reply({ embeds: [success] });
    } catch (err) {
      console.error("Failed to ban member:", err);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Ban Failed",
            "❌ Failed to ban the member. Please ensure I have the proper permissions and role hierarchy, and that the provided ID is valid.",
          ),
        ],
      });
    }
  },
};

export default banCommand;
