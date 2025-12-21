import {
  Message,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
} from "discord.js";
import { PrefixCommand } from "../types";

/**
 * Purge command - bulk deletes messages in the current text channel.
 *
 * Usage:
 *  Spurge <count>
 *
 * Behavior:
 * - Requires the caller to have ManageMessages permission.
 * - Deletes between 1 and 100 messages (Discord limitation).
 * - Handles channels that aren't text-based and messages older than ~14 days.
 * - Sends a short ephemeral confirmation that auto-deletes.
 */
const purgeCommand: PrefixCommand = {
  name: "purge",
  description: "Bulk deletes messages in the current text channel (1-100).",
  usage: "<count>",
  permissions: [PermissionFlagsBits.ManageMessages],
  async execute(message: Message, args: string[]) {
    // Must be executed inside a guild text channel
    if (!message.guild) {
      await message.reply("This command can only be used in a server.");
      return;
    }

    if (!message.channel.isTextBased()) {
      await message.reply("This command must be run in a text channel.");
      return;
    }

    const raw = args[0];
    const count = Number(raw);

    if (!raw || isNaN(count) || count < 1 || count > 100) {
      await message.reply(
        "Please provide a number of messages to delete (1-100).\nUsage: `Spurge <count>`",
      );
      return;
    }

    const channel = message.channel as TextChannel;

    try {
      // Fetch messages to delete
      const fetched = await channel.messages.fetch({ limit: count });

      // bulkDelete will ignore messages older than ~14 days; pass true to filter them out
      await channel.bulkDelete(fetched, true);

      // Confirmation embed (kept brief)
      const embed = new EmbedBuilder()
        .setTitle("Messages Purged")
        .setColor(0x2ecc71)
        .setDescription(`✅ Successfully deleted ${fetched.size} message(s).`)
        .setFooter({
          text: "Note: messages older than ~14 days cannot be bulk-deleted.",
        });

      const confirmation = await message.reply({ embeds: [embed] });

      // Auto-delete the confirmation after a short time to keep channel clean
      setTimeout(() => confirmation.delete().catch(() => {}), 6_000);
    } catch (error) {
      console.error("Failed to purge messages:", error);
      await message.reply(
        "❌ Failed to purge messages. Messages older than ~14 days cannot be bulk-deleted, and I need the Manage Messages permission.",
      );
    }
  },
};

export default purgeCommand;
