import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { PrefixCommand } from "../types";

/**
 * Timeout (mute) a member using Discord's native timeout feature.
 *
 * Usage:
 *  Stimeout @user 10m [reason]
 *
 * Duration format:
 *  - Number followed by unit: s, m, h, d (seconds, minutes, hours, days)
 *  - Examples: 30s, 10m, 2h, 1d
 *
 * Notes:
 *  - Requires the caller to have ModerateMembers permission.
 *  - Requires the bot to have ModerateMembers permission.
 *  - Caps duration to Discord's 28-day timeout maximum.
 *  - Performs role-hierarchy and basic validations.
 */
const timeoutCommand: PrefixCommand = {
  name: "timeout",
  description:
    "Temporarily timeout/mute a member. Format: Stimeout @user 10m [reason]",
  usage: "<user> <duration> [reason]",
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(message: Message, args: string[]) {
    if (!message.guild) {
      await message.reply("This command can only be used in a server.");
      return;
    }

    const executor = message.member;
    const botMember = message.guild.members.me;

    if (!executor) {
      await message.reply("Could not resolve your guild member information.");
      return;
    }

    // Permission checks
    if (!executor.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply(
        "❌ You need the `Moderate Members` permission to timeout members.",
      );
      return;
    }

    if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply(
        "❌ I need the `Moderate Members` permission to apply timeouts.",
      );
      return;
    }

    if (!args[0] || !args[1]) {
      await message.reply(
        "Usage: `Stimeout @user 10m [reason]` (duration example: 30s, 10m, 2h, 1d)",
      );
      return;
    }

    // Resolve target member (mention or ID)
    let target: GuildMember | null = null;
    if (message.mentions.members && message.mentions.members.size > 0) {
      target = message.mentions.members.first() || null;
    } else {
      const id = args[0].replace(/[<@!>]/g, "");
      target = await message.guild.members.fetch(id).catch(() => null);
    }

    if (!target) {
      await message.reply(
        "❌ Could not find that member in this server. Mention them or provide their ID.",
      );
      return;
    }

    // Prevent self, bot, or server owner timeouts
    if (target.id === message.author.id) {
      await message.reply("❌ You cannot timeout yourself.");
      return;
    }
    if (target.id === message.client.user?.id) {
      await message.reply("❌ I cannot timeout myself.");
      return;
    }
    if (target.id === message.guild.ownerId) {
      await message.reply("❌ You cannot timeout the server owner.");
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
      await message.reply(
        "❌ You cannot timeout this member because they have an equal or higher role than you.",
      );
      return;
    }

    if (botHighest <= targetHighest) {
      await message.reply(
        "❌ I cannot timeout this member because their role is higher than (or equal to) mine.",
      );
      return;
    }

    // Parse duration token
    const durationToken = args[1];
    const matched = durationToken.match(/^(\d+)(s|m|h|d)$/i);
    if (!matched) {
      await message.reply(
        "Invalid duration format. Use examples like: 30s, 10m, 2h, 1d",
      );
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
      await message.reply(
        "Invalid duration. Use a positive duration like 30s, 10m, 2h, 1d.",
      );
      return;
    }

    // Discord caps timeouts at 28 days
    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
    const appliedMs = Math.min(ms, MAX_TIMEOUT_MS);

    const reason =
      args.slice(2).join(" ").trim() || `Timed out by ${message.author.tag}`;

    try {
      // Use GuildMember.timeout (discord.js v14) — duration in ms
      await target.timeout(appliedMs, `${reason} — by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setTitle("Member Timed Out")
        .setColor(0xffa500)
        .setDescription(`${target.user.tag} has been put in timeout.`)
        .addFields(
          { name: "Moderator", value: `${message.author.tag}`, inline: true },
          {
            name: "Duration",
            value: `${Math.round(appliedMs / 1000)}s`,
            inline: true,
          },
          { name: "Reason", value: reason, inline: false },
        );

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Failed to apply timeout:", err);
      await message.reply(
        "❌ Failed to apply timeout. Ensure I have permission and the member is eligible for timeout.",
      );
    }
  },
};

export default timeoutCommand;
