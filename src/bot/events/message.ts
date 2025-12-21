import {
  Client,
  Message,
  PermissionResolvable,
  APIEmbed,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils/webhookLogger";

/**
 * Handles all messageCreate events
 */
export function setupMessageHandler(client: Client): () => void {
  const handleMessage = async (message: Message) => {
    // Ignore bot messages and messages without content
    if (message.author.bot || !message.content) return;

    try {
      // Process message through all message handlers
      await processMessage(message);
    } catch (error) {
      console.error("❌ Error in message handler:", error);
      await logger.error(error as Error, {
        type: "messageHandler",
        userId: message.author.id,
        guildId: message.guild?.id,
        channelId: message.channel.id,
      });
    }
  };

  client.on("messageCreate", handleMessage);

  return () => {
    client.off("messageCreate", handleMessage);
  };
}

/**
 * Processes a message through all registered handlers
 */
async function processMessage(message: Message): Promise<void> {
  const lowercasedContent = message.content.toLowerCase();

  // Check for plugin search using [[plugin name]] format first, as it's not prefix-based
  const pluginBracketMatch = message.content.match(/^\[\[(.*?)\]\]$/);
  if (pluginBracketMatch) {
    const pluginName = pluginBracketMatch[1].trim();
    if (pluginName) {
      await handlePluginSearch(message, [pluginName]);
    }
    return;
  }

  // Skip if message doesn't start with prefix
  if (!lowercasedContent.startsWith(config.prefix.toLowerCase())) {
    // Handle other non-command messages (auto-previews, etc.)
    await handleNonCommandMessage(message, lowercasedContent);
    return;
  }

  // Handle prefix commands
  await handlePrefixCommand(message, lowercasedContent);
}

/**
 * Handles messages that aren't prefix commands
 */
async function handleNonCommandMessage(
  message: Message,
  lowercasedContent: string,
): Promise<void> {
  // Check for special non-prefix commands
  if (lowercasedContent.startsWith("snote")) {
    await handleSnoteCommand(message);
    return;
  }

  // Check for plugin search using splug prefix
  if (lowercasedContent.startsWith("splug ")) {
    const args = message.content.slice("splug ".length).trim().split(/\s+/);
    await handlePluginSearch(message, args);
    return;
  }

  // Auto-preview features (run in background, don't block)
  processAutoPreviews(message).catch((err) => {
    console.error("❌ Error in auto previews:", err);
  });
}

/**
 * Handles prefix commands
 */
async function handlePrefixCommand(
  message: Message,
  lowercasedContent: string,
): Promise<void> {
  // Extract command name and arguments after the prefix
  const contentWithoutPrefix = lowercasedContent
    .slice(config.prefix.length)
    .trim();
  const args =
    contentWithoutPrefix.length > 0 ? contentWithoutPrefix.split(/\s+/) : [];
  const commandName = args.shift();

  if (!commandName) return; // No command name found after prefix

  try {
    // Delegate to prefix command handler
    const { commandRegistry } = await import("../../commands/index");
    const command = commandRegistry.getPrefixCommand(commandName);

    if (!command) {
      const unknownCommandEmbed = new EmbedBuilder()
        .setTitle("❌ Unknown Command")
        .setColor(Colors.Red)
        .setDescription(
          `The command \`${config.prefix}${commandName}\` was not found.`,
        )
        .addFields({
          name: "🔍 Did you mean?",
          value: `Try using \`${config.prefix}help\` to see all available commands.`,
          inline: false,
        })
        .setFooter({
          text: `Requested by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL(),
        })
        .setTimestamp();

      await message.reply({ embeds: [unknownCommandEmbed] }).catch(() => {});
      return;
    }

    // Basic permission check (can be expanded with more robust role management)
    if (command.permissions && message.member) {
      const missingPermissions: PermissionResolvable[] =
        command.permissions.filter(
          (perm: PermissionResolvable) =>
            !message.member!.permissions.has(perm),
        );

      if (missingPermissions.length > 0) {
        const permissionEmbed = new EmbedBuilder()
          .setTitle("🔒 Permission Denied")
          .setColor(Colors.Red)
          .setDescription(
            `You don't have permission to use \`${config.prefix}${commandName}\`.`,
          )
          .addFields({
            name: "Missing Permissions",
            value: `\`${missingPermissions.join("`, `")}\``,
            inline: false,
          })
          .setFooter({
            text: `Requested by ${message.author.tag}`,
            iconURL: message.author.displayAvatarURL(),
          })
          .setTimestamp();

        await message.reply({ embeds: [permissionEmbed] }).catch(() => {});
        return;
      }
    }

    await command.execute(message, args);
  } catch (error) {
    console.error(`❌ Error handling prefix command ${commandName}:`, error);

    // Send a user-facing embed notifying about the error
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Command Error")
      .setColor(Colors.Red)
      .setDescription("An error occurred while executing this command.")
      .addFields({
        name: "Command",
        value: `\`${config.prefix}${commandName}\``,
        inline: true,
      })
      .addFields({
        name: "Status",
        value: "Failed",
        inline: true,
      })
      .setFooter({
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();

    await message.reply({ embeds: [errorEmbed] }).catch(() => {});
  }
}

/**
 * Handles snote command
 */
async function handleSnoteCommand(message: Message): Promise<void> {
  try {
    const { handleSnoteCommand } = await import("../../features/snotes");
    await handleSnoteCommand(message);
  } catch (error) {
    console.error("❌ Error handling snote command:", error);
    await logger.error(error as Error, {
      type: "snoteCommand",
      userId: message.author.id,
      guildId: message.guild?.id,
      channelId: message.channel.id,
    });
  }
}

/**
 * Handles plugin search command
 */
async function handlePluginSearch(
  message: Message,
  args: string[],
): Promise<void> {
  try {
    const { handlePluginSearch: serviceHandlePluginSearch } = await import(
      "../../services/pluginService"
    );
    await serviceHandlePluginSearch(message, args);
  } catch (error) {
    console.error("❌ Error handling plugin search:", error);
    await logger.error(error as Error, {
      type: "pluginSearch",
      userId: message.author.id,
      guildId: message.guild?.id,
      channelId: message.channel.id,
    });
  }
}

/**
 * Processes auto-preview features
 */
async function processAutoPreviews(message: Message): Promise<void> {
  try {
    // Code previews
    const { autoPreviewCodeLinks } = await import("../../features/codePreview");
    await autoPreviewCodeLinks(message);

    // Commit previews
    const { autoPreviewCommitLinks } = await import(
      "../../features/commitPreview"
    );
    await autoPreviewCommitLinks(message);
  } catch (error) {
    console.error("❌ Error processing auto-previews:", error);
    await logger.error(error as Error, {
      type: "autoPreviews",
      userId: message.author.id,
      guildId: message.guild?.id,
      channelId: message.channel.id,
    });
  }
}
