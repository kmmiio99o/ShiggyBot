import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  User,
} from "discord.js";
import { PrefixCommand } from "../types";

/**
 * Kick command
 *
 * Usage:
 *  Skick @user [reason...]
 *
 * Behavior:
 * - Requires caller to have KickMembers permission.
 * - Requires bot to have KickMembers permission.
 * - Validates role hierarchy (caller must be higher than target, bot must be higher).
 * - Prevents kicking the guild owner, the bot, or the caller.
 * - Does not DM the target; performs the kick immediately.
 * - Returns a confirmation embed on success or a helpful error message on failure.
 */
const kickCommand: PrefixCommand = {
  name: "kick",
  description: "Kick a member from the server.",
  usage: "<user> [reason]",
  permissions: [PermissionFlagsBits.KickMembers],
  async execute(message: Message, args: string[]) {
    // Must be used in a guild
    if (!message.guild) {
      await message.reply("This command can only be used in a server.");
      return;
    }

    const executor = message.member;
    const botMember = message.guild.members.me;

    if (!executor) {
      await message.reply(
        "Could not resolve your guild membership information.",
      );
      return;
    }

    // Executor permission check
    if (!executor.permissions.has(PermissionFlagsBits.KickMembers)) {
      await message.reply(
        "❌ You need the `Kick Members` permission to use this command.",
      );
      return;
    }

    // Bot permission check
    if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
      await message.reply(
        "❌ I do not have the `Kick Members` permission. Please grant me that permission and try again.",
      );
      return;
    }

    // Resolve target from mention or ID
    let targetMember: GuildMember | null = null;
    let targetUser: User | null = null;

    if (message.mentions.members && message.mentions.members.size > 0) {
      targetMember = message.mentions.members.first() || null;
      targetUser = targetMember?.user ?? null;
    } else if (args[0]) {
      const id = args[0].replace(/[<@!>]/g, "");
      targetMember = await message.guild.members.fetch(id).catch(() => null);
      targetUser = targetMember?.user ?? null;
    }

    if (!targetMember || !targetUser) {
      await message.reply(
        "❌ Could not find that user in this server. Please mention them or provide their ID.\n" +
          "Usage: `Skick @user [reason]`",
      );
      return;
    }

    // Prevent kicking self, bot, or server owner
    if (targetUser.id === message.author.id) {
      await message.reply("❌ You cannot kick yourself.");
      return;
    }
    if (targetUser.id === message.client.user?.id) {
      await message.reply("❌ I cannot kick myself.");
      return;
    }
    if (targetUser.id === message.guild.ownerId) {
      await message.reply("❌ You cannot kick the server owner.");
      return;
    }

    // Role hierarchy checks
    const executorHighest = executor.roles.highest?.position ?? 0;
    const targetHighest = targetMember.roles.highest?.position ?? 0;
    const botHighest = botMember?.roles.highest?.position ?? 0;

    // If executor is not the guild owner and has lower or equal role than target -> block
    if (
      message.guild.ownerId !== message.author.id &&
      executorHighest <= targetHighest
    ) {
      await message.reply(
        "❌ You cannot kick this member because they have an equal or higher role than you.",
      );
      return;
    }

    // Bot must be able to kick (role hierarchy)
    if (botHighest <= targetHighest) {
      await message.reply(
        "❌ I cannot kick this member because their highest role is higher than (or equal to) mine.",
      );
      return;
    }

    // Check member.kickable if present (guard for libraries/permissions)
    if (typeof targetMember.kickable === "boolean" && !targetMember.kickable) {
      await message.reply(
        "❌ I do not have permission to kick that user (they may have higher role or owner privileges).",
      );
      return;
    }

    const reason =
      args.slice(1).join(" ").trim() || `Kicked by ${message.author.tag}`;

    // Perform the kick
    try {
      await targetMember.kick(reason);
      const embed = new EmbedBuilder()
        .setTitle("Member Kicked")
        .setColor(0x2ecc71)
        .setDescription(`${targetUser.tag} has been kicked.`)
        .addFields(
          { name: "Moderator", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason, inline: false },
        );

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Failed to kick member:", error);
      await message.reply(
        "❌ Failed to kick that user. Please ensure I have the necessary permissions and role hierarchy.",
      );
    }
  },
};

export default kickCommand;
