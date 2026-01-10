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

    // Permission checks for executor
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
      await message.reply({
        embeds: [
          createErrorEmbed(
            "User Not Found",
            `❌ Could not find the specified user. Please mention the user or provide their ID.

    **Usage:** \`${process.env.PREFIX || "S"}ban @user [deleteTime e.g. 7d, 30min, 0] [reason...]\`
    **Example:** \`${process.env.PREFIX || "S"}ban @user 7d Spamming chat\``,
          ),
        ],
      });
      return;
    }

    // Prevent self / bot / owner banning
    if (targetUser.id === message.author.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ You cannot ban yourself."),
        ],
      });
      return;
    }
    if (targetUser.id === message.client.user?.id) {
      await message.reply({
        embeds: [createErrorEmbed("Invalid Target", "❌ I cannot ban myself.")],
      });
      return;
    }
    if (targetUser.id === message.guild.ownerId) {
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

    // Role hierarchy checks
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

    // Parse delete time
    let deleteDays = 0;
    let deleteMessageSeconds = 0;
    let displayDeleteTime = "0";
    let reasonParts: string[] = [];

    // args[] may start with the user mention/id; remove it for parsing
    const consumed =
      message.mentions.members && message.mentions.members.size > 0 ? 1 : 1;
    const remaining = args.slice(consumed);

    // Attempt to parse a time token from the first remaining argument
    if (remaining.length > 0) {
      const token = remaining[0].toLowerCase();
      const match = token.match(
        /^(\d+)(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)?$/,
      );
      if (match) {
        const num = Number(match[1]);
        const unit = match[2] || "d";
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

        // Clamp to a maximum of 7 days
        const maxSeconds = 7 * 24 * 60 * 60;
        if (seconds > maxSeconds) seconds = maxSeconds;

        deleteMessageSeconds = seconds;
        deleteDays = Math.floor(deleteMessageSeconds / (24 * 60 * 60));

        // Human-friendly display
        if (deleteMessageSeconds === 0) {
          displayDeleteTime = "0";
        } else if (deleteMessageSeconds % (24 * 60 * 60) === 0) {
          const d = deleteMessageSeconds / (24 * 60 * 60);
          displayDeleteTime = `${d} day(s)`;
        } else if (deleteMessageSeconds % 3600 === 0) {
          const h = deleteMessageSeconds / 3600;
          displayDeleteTime = `${h} hour(s)`;
        } else if (deleteMessageSeconds % 60 === 0) {
          const m = deleteMessageSeconds / 60;
          displayDeleteTime = `${m} minute(s)`;
        } else {
          displayDeleteTime = `${deleteMessageSeconds} second(s)`;
        }

        reasonParts = remaining.slice(1);
      } else {
        // First token isn't a time specifier -> treat everything as the reason
        reasonParts = remaining.slice(0);
        deleteMessageSeconds = 0;
        displayDeleteTime = "0";
      }
    } else {
      reasonParts = [];
      deleteMessageSeconds = 0;
      displayDeleteTime = "0";
    }

    const reason =
      reasonParts.join(" ").trim() || `Banned by ${message.author.tag}`;
    // Perform the ban
    try {
      await targetMember.ban({
        deleteMessageSeconds: deleteMessageSeconds,
        reason: `${reason} — banned by ${message.author.tag}`,
      });

      const success = new EmbedBuilder()
        .setTitle("✅ User Banned")
        .setColor(Colors.Green)
        .setDescription(`${targetUser.tag} has been banned from the server.`)
        .addFields(
          { name: "👤 Member", value: `${targetUser.tag}`, inline: true },
          { name: "🆔 ID", value: targetUser.id, inline: true },
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
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Action performed by ${message.author.tag}` });

      await message.reply({ embeds: [success] });
    } catch (err) {
      console.error("Failed to ban member:", err);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Ban Failed",
            "❌ Failed to ban the member. Please ensure I have the proper permissions and role hierarchy.",
          ),
        ],
      });
    }
  },
};

export default banCommand;
