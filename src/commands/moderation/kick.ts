import {
  Message,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  User,
  Colors,
} from "discord.js";
import { PrefixCommand } from "../types";

const kickCommand: PrefixCommand = {
  name: "kick",
  description: "Kick a member from the server.",
  usage: "<user> [reason]",
  permissions: [PermissionFlagsBits.KickMembers],
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    // Must be used in a guild
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
            "❌ Could not resolve your guild membership information.",
          ),
        ],
      });
      return;
    }

    // Executor permission check
    if (!executor.permissions.has(PermissionFlagsBits.KickMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Permission Denied",
            "❌ You need the `Kick Members` permission to use this command.",
          ),
        ],
      });
      return;
    }

    // Bot permission check
    if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Bot Permission Error",
            "❌ I do not have the `Kick Members` permission. Please grant me that permission and try again.",
          ),
        ],
      });
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
      await message.reply({
        embeds: [
          createErrorEmbed(
            "User Not Found",
            `❌ Could not find that user in this server.

**Usage:** \`${process.env.PREFIX || "S"}kick @user [reason]\`
**Example:** \`${process.env.PREFIX || "S"}kick @user Breaking server rules\`

• Mention the user directly
• Or provide their user ID
• Ensure they are currently in this server`,
          ),
        ],
      });
      return;
    }

    // Prevent kicking self, bot, or server owner
    if (targetUser.id === message.author.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ You cannot kick yourself."),
        ],
      });
      return;
    }
    if (targetUser.id === message.client.user?.id) {
      await message.reply({
        embeds: [
          createErrorEmbed("Invalid Target", "❌ I cannot kick myself."),
        ],
      });
      return;
    }
    if (targetUser.id === message.guild.ownerId) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Target",
            "❌ You cannot kick the server owner.",
          ),
        ],
      });
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
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Hierarchy",
            "❌ You cannot kick this member because they have an equal or higher role than you.",
          ),
        ],
      });
      return;
    }

    // Bot must be able to kick (role hierarchy)
    if (botHighest <= targetHighest) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Bot Role Hierarchy",
            "❌ I cannot kick this member because their highest role is higher than (or equal to) mine.",
          ),
        ],
      });
      return;
    }

    // Check member.kickable if present
    if (typeof targetMember.kickable === "boolean" && !targetMember.kickable) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Cannot Kick",
            "❌ I do not have permission to kick that user. They may have:\n• A higher role than me\n• Owner privileges\n• Or I lack the proper permissions",
          ),
        ],
      });
      return;
    }

    const reason =
      args.slice(1).join(" ").trim() || `Kicked by ${message.author.tag}`;

    // Perform the kick
    try {
      await targetMember.kick(reason);
      const embed = new EmbedBuilder()
        .setTitle("👢 Member Kicked")
        .setColor(Colors.Green)
        .setDescription(`${targetUser.tag} has been kicked from the server.`)
        .addFields(
          { name: "👤 Member", value: targetUser.tag, inline: true },
          { name: "🆔 ID", value: targetUser.id, inline: true },
          { name: "🛡️ Moderator", value: message.author.tag, inline: true },
          { name: "📝 Reason", value: reason, inline: false },
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Action performed by ${message.author.tag}` });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Failed to kick member:", error);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Kick Failed",
            "❌ Failed to kick that user. Please ensure:\n• I have the Kick Members permission\n• My role is higher than the target's role\n• The target is kickable\n• Discord API is not experiencing issues",
          ),
        ],
      });
    }
  },
};

export default kickCommand;
