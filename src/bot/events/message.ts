import { Client, Message } from "discord.js";
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
  const content = message.content.toLowerCase();

  // Skip if message doesn't start with prefix
  if (!content.startsWith(config.prefix.toLowerCase())) {
    // Handle non-command messages (auto-previews, etc.)
    await handleNonCommandMessage(message);
    return;
  }

  // Handle prefix commands
  await handlePrefixCommand(message);
}

/**
 * Handles messages that aren't prefix commands
 */
async function handleNonCommandMessage(message: Message): Promise<void> {
  const content = message.content;

  // Check for special non-prefix commands
  if (content.toLowerCase().startsWith("snote")) {
    await handleSnoteCommand(message);
    return;
  }

  // Check for plugin search
  if (
    content.toLowerCase().startsWith("splug ") ||
    content.match(/^\[\[(.*?)]]$/)
  ) {
    await handlePluginSearch(message);
    return;
  }

  // Auto-preview features (run in background, don't block)
  processAutoPreviews(message).catch(() => {});
}

/**
 * Handles prefix commands
 */
async function handlePrefixCommand(message: Message): Promise<void> {
  const content = message.content.slice(config.prefix.length).trim();
  const args = content.split(/\s+/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  try {
    // Delegate to prefix command handler
    const prefixModule = await import("../../commands/prefix");
    await prefixModule.handlePrefixCommand(message, commandName, args);
  } catch (error) {
    console.error(`❌ Error handling prefix command ${commandName}:`, error);

    const embed = {
      title: "❌ Command Error",
      description: "An error occurred while executing this command.",
      color: 0xff5555,
      timestamp: new Date().toISOString(),
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
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
  }
}

/**
 * Handles plugin search command
 */
async function handlePluginSearch(message: Message): Promise<void> {
  try {
    const { handlePluginSearch } = await import("../../services/pluginService");
    await handlePluginSearch(message);
  } catch (error) {
    console.error("❌ Error handling plugin search:", error);
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
  }
}
