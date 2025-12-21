import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  User,
} from "discord.js";
import { PrefixCommand } from "../types";

/**
 * Immediate ban command (no confirmation, no DM).
 *
 * Usage:
 *  Sban @user [deleteDays 0-7] [reason...]
 *
 * Behavior:
 * - Requires the caller to have BanMembers permission.
 * - Requires the bot to have BanMembers permission.
 * - Ensures role hierarchy (caller must be higher than target, bot must be higher).
 * - Prevents banning the guild owner, the bot itself, or the caller.
 * - Immediately performs the ban once arguments are validated.
 */

const banCommand: PrefixCommand = {
  name: "ban",
  description: "Ban a server member immediately.",
  usage: "<user> [deleteDays 0-7] [reason...]",
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(message: Message, args: string[]) {
    // Only allowed in guilds
    if (!message.guild) {
      await message.reply("This command can only be used in a server (guild).");
      return;
    }

    const executor = message.member;
    const botMember = message.guild.members.me;

    if (!executor) {
      await message.reply("Could not resolve your guild member info.");
      return;
    }

    // Permission checks for executor
    if (!executor.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply(
        "❌ You need the `Ban Members` permission to use this command.",
      );
      return;
    }

    // Bot permission check
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply(
        "❌ I do not have the `Ban Members` permission. Please grant it to me and try again.",
      );
      return;
    }

    // Resolve target member
    let targetMember: GuildMember | null = null;
    let targetUser: User | null = null;

    // Prefer mention
    if (message.mentions.members && message.mentions.members.size > 0) {
      targetMember = message.mentions.members.first() || null;
      targetUser = targetMember?.user ?? null;
    } else if (args[0]) {
      // Try as ID
      const id = args[0].replace(/[<@!>]/g, "");
      try {
        targetMember = await message.guild.members.fetch(id).catch(() => null);
        targetUser = targetMember?.user ?? null;
      } catch {
        targetMember = null;
      }
    }

    if (!targetMember || !targetUser) {
      await message.reply(
        "❌ Could not find the specified user. Please mention the user or provide their ID.\n" +
          "Usage: `Sban @user [deleteDays 0-7] [reason...]`",
      );
      return;
    }

    // Prevent self / bot / owner banning
    if (targetUser.id === message.author.id) {
      await message.reply("❌ You cannot ban yourself.");
      return;
    }
    if (targetUser.id === message.client.user?.id) {
      await message.reply("❌ I cannot ban myself.");
      return;
    }
    if (targetUser.id === message.guild.ownerId) {
      await message.reply("❌ You cannot ban the server owner.");
      return;
    }

    // Role hierarchy checks
    const executorHighest = executor.roles.highest?.position ?? 0;
    const targetHighest = targetMember.roles.highest?.position ?? 0;
    const botHighest = botMember?.roles.highest?.position ?? 0;

    if (
      executorHighest <= targetHighest &&
      message.guild.ownerId !== message.author.id
    ) {
      await message.reply(
        "❌ You cannot ban this member because they have an equal or higher role than you.",
      );
      return;
    }

    if (botHighest <= targetHighest) {
      await message.reply(
        "❌ I cannot ban this member because their highest role is higher than (or equal to) mine.",
      );
      return;
    }

    // Parse delete days (0-7) and reason
    let deleteDays = 0;
    let reasonParts: string[] = [];

    // args[] may start with the user mention/id; remove it for parsing
    const consumed =
      message.mentions.members && message.mentions.members.size > 0 ? 1 : 1;
    const remaining = args.slice(consumed);

    // handle if the first remaining token is numeric (deleteDays)
    if (remaining.length > 0 && /^\d+$/.test(remaining[0])) {
      const parsed = Math.max(0, Math.min(7, Number(remaining[0])));
      deleteDays = parsed;
      reasonParts = remaining.slice(1);
    } else {
      reasonParts = remaining.slice(0);
    }

    const reason =
      reasonParts.join(" ").trim() || `Banned by ${message.author.tag}`;

    // Perform the ban
    try {
      await targetMember.ban({
        deleteMessageDays: deleteDays,
        reason: `${reason} — banned by ${message.author.tag}`,
      });

      const success = new EmbedBuilder()
        .setTitle("User Banned")
        .setColor(0x2ecc71)
        .setDescription(`${targetUser.tag} has been banned.`)
        .addFields(
          { name: "Moderator", value: `${message.author.tag}`, inline: true },
          {
            name: "Deleted messages (days)",
            value: `${deleteDays}`,
            inline: true,
          },
          {
            name: "Reason",
            value: reason || "No reason provided",
            inline: false,
          },
        );

      await message.reply({ embeds: [success] });
    } catch (err) {
      console.error("Failed to ban member:", err);
      await message.reply(
        "❌ Failed to ban the member. Please ensure I have the proper permissions and role hierarchy.",
      );
    }
  },
};

export default banCommand;
