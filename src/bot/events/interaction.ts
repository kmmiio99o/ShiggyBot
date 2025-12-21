import { Client, Interaction } from "discord.js";
import { logger } from "../../utils/webhookLogger";
import { handlePluginButton } from "../../services/pluginService";

/**
 * Handles all interactionCreate events
 */
export function setupInteractionHandler(client: Client): () => void {
  const slashCommandHandler = new SlashCommandHandler(client);

  const handleInteraction = async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await slashCommandHandler.handleCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
        await slashCommandHandler.handleAutocomplete(
          interaction,
          interaction.commandName,
        );
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

async function handleButtonInteraction(interaction: any): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith("plg_")) {
    try {
      await handlePluginButton(interaction);
    } catch (error) {
      console.error("❌ Error handling plugin button:", error);
      if (interaction.isRepliable() && !interaction.replied) {
        try {
          await interaction.reply({
            content: "❌ An error occurred while processing this button.",
            ephemeral: true,
          });
        } catch (replyError) {
          // Ignore reply errors
        }
      }
    }
    return;
  }
}
