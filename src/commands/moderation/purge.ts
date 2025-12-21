import {
  Message,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { PrefixCommand } from "../types";

const purgeCommand: PrefixCommand = {
  name: "purge",
  description: "Bulk deletes messages in the current text channel (1-100).",
  usage: "<count>",
  permissions: [PermissionFlagsBits.ManageMessages],
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    // Must be executed inside a guild text channel
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

    if (!message.channel.isTextBased()) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Channel Error",
            "❌ This command must be run in a text channel.",
          ),
        ],
      });
      return;
    }

    const raw = args[0];
    const count = Number(raw);

    if (!raw || isNaN(count) || count < 1 || count > 100) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Invalid Count",
            `❌ Please provide a valid number of messages to delete (1-100).

**Usage:** \`${process.env.PREFIX || "S"}purge <count>\`
**Example:** \`${process.env.PREFIX || "S"}purge 50\`
**Note:** Maximum of 100 messages per command due to Discord limitations.`,
          ),
        ],
      });
      return;
    }

    const channel = message.channel as TextChannel;

    try {
      // Fetch messages to delete
      const fetched = await channel.messages.fetch({ limit: count });

      // bulkDelete will ignore messages older than ~14 days; pass true to filter them out
      await channel.bulkDelete(fetched, true);

      // Confirmation embed
      const embed = new EmbedBuilder()
        .setTitle("🧹 Messages Purged")
        .setColor(Colors.Green)
        .setDescription(`✅ Successfully deleted ${fetched.size} message(s).`)
        .addFields(
          {
            name: "📊 Messages Deleted",
            value: `${fetched.size}`,
            inline: true,
          },
          { name: "📝 Channel", value: `<#${channel.id}>`, inline: true },
          { name: "🛡️ Moderator", value: message.author.tag, inline: true },
        )
        .setFooter({
          text: "Note: Messages older than ~14 days cannot be bulk-deleted.",
          iconURL: message.guild.iconURL() || undefined,
        })
        .setTimestamp();

      const confirmation = await message.reply({ embeds: [embed] });

      // Auto-delete the confirmation after a short time to keep channel clean
      setTimeout(() => confirmation.delete().catch(() => {}), 6_000);
    } catch (error) {
      console.error("Failed to purge messages:", error);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Purge Failed",
            `❌ Failed to purge messages.

**Possible reasons:**
• I don't have the **Manage Messages** permission
• Messages are older than ~14 days (Discord limitation)
• There was an issue with the Discord API
• Trying to purge too many messages at once

**Tips:**
• Make sure I have proper permissions
• Try with a smaller number of messages
• For old messages, delete them manually`,
          ),
        ],
      });
    }
  },
};

export default purgeCommand;
