import { Client, Interaction } from "discord.js";
import { logger } from "../../utils/webhookLogger";

/**
 * Handles all interactionCreate events
 */
export function setupInteractionHandler(client: Client): () => void {
  const handleInteraction = async (interaction: Interaction) => {
    try {
      // Handle different types of interactions
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
      }
    } catch (error) {
      console.error("❌ Error in interaction handler:", error);
      await logger.error(error as Error, {
        type: "interactionHandler",
        userId: interaction.user?.id,
        guildId: interaction.guild?.id,
        interactionType: interaction.type,
        interactionId: interaction.id,
      });

      // Try to reply with error if possible
      if (interaction.isRepliable() && !interaction.replied) {
        try {
          await interaction.reply({
            content: "❌ An error occurred while processing this interaction.",
            ephemeral: true,
          });
        } catch (replyError) {
          // Ignore reply errors
        }
      }
    }
  };

  client.on("interactionCreate", handleInteraction);

  return () => {
    client.off("interactionCreate", handleInteraction);
  };
}

/**
 * Handles slash commands
 */
async function handleSlashCommand(interaction: any): Promise<void> {
  try {
    const { handleSlashCommand } = await import("../../commands/slash");
    await handleSlashCommand(interaction);
  } catch (error) {
    console.error("❌ Error handling slash command:", error);
    throw error;
  }
}

/**
 * Handles button interactions
 */
async function handleButtonInteraction(interaction: any): Promise<void> {
  const customId = interaction.customId;

  // Handle plugin buttons
  if (customId.startsWith("plg_")) {
    try {
      const { handlePluginButton } = await import(
        "../../services/pluginService"
      );
      await handlePluginButton(interaction);
    } catch (error) {
      console.error("❌ Error handling plugin button:", error);
      throw error;
    }
    return;
  }

  // Add more button handlers as needed
}

/**
 * Handles autocomplete interactions
 */
async function handleAutocomplete(interaction: any): Promise<void> {
  const commandName = interaction.commandName;

  try {
    const { handleAutocomplete } = await import("../../commands/slash");
    await handleAutocomplete(interaction, commandName);
  } catch (error) {
    console.error("❌ Error handling autocomplete:", error);
  }
}
