import {
  Client,
  Interaction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  PermissionResolvable,
} from "discord.js";
import { logger } from "../../utils/webhookLogger";
import { handlePluginButton } from "../../services/pluginService";
import { commandRegistry } from "../../commands/index";

/**
 * Handles all interactionCreate events
 *
 * Replaces the previous SlashCommandHandler dependency by using the
 * central `commandRegistry` to look up and invoke slash commands and
 * autocomplete handlers.
 */
export function setupInteractionHandler(client: Client): () => void {
  const handleInteraction = async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const chat = interaction as ChatInputCommandInteraction;
        const command = commandRegistry.getSlashCommand(chat.commandName);

        if (!command) {
          if (interaction.isRepliable() && !interaction.replied) {
            await interaction
              .reply({
                content: `❌ Unknown slash command: \`${chat.commandName}\``,
                ephemeral: true,
              })
              .catch(() => {});
          }
          return;
        }

        // Permissions check (if defined on the command)
        if (command.permissions) {
          const missing = command.permissions.filter(
            (perm: PermissionResolvable) => !chat.memberPermissions?.has(perm),
          );

          if (missing.length > 0) {
            if (interaction.isRepliable() && !interaction.replied) {
              await interaction
                .reply({
                  content: `❌ You are missing the following permissions to use this command: \`${missing.join(
                    ", ",
                  )}\``,
                  ephemeral: true,
                })
                .catch(() => {});
            }
            return;
          }
        }

        // Execute the command
        await command.execute(chat);
      } else if (interaction.isButton()) {
        // Delegate button handling to service
        await handleButtonInteraction(interaction as ButtonInteraction);
      } else if (interaction.isAutocomplete()) {
        const auto = interaction as AutocompleteInteraction;
        const command = commandRegistry.getSlashCommand(auto.commandName);
        if (command && typeof command.autocomplete === "function") {
          await command.autocomplete(auto);
        }
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
        } catch {
          // ignore reply errors
        }
      }
    }
  };

  client.on("interactionCreate", handleInteraction);

  return () => {
    client.off("interactionCreate", handleInteraction);
  };
}

async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId ?? "";

  if (customId.startsWith("plg_")) {
    try {
      await handlePluginButton(interaction);
    } catch (error) {
      console.error("❌ Error handling plugin button:", error);
      await logger.error(error as Error, {
        type: "pluginButton",
        userId: interaction.user?.id,
        guildId: interaction.guild?.id,
        interactionId: interaction.id,
      });

      if (interaction.isRepliable() && !interaction.replied) {
        try {
          await interaction.reply({
            content: "❌ An error occurred while processing this button.",
            ephemeral: true,
          });
        } catch {
          // ignore reply errors
        }
      }
    }
    return;
  }

  // If more button types are used in the future, handle them here.
}
