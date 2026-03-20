import {
  Client,
  Interaction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  PermissionResolvable,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
                flags: 64,
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
                  flags: 64,
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
      } else if (interaction.isModalSubmit()) {
        await handleModalInteraction(interaction);
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
            flags: 64,
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
            flags: 64,
          });
        } catch {
          // ignore reply errors
        }
      }
    }
    return;
  }

  if (customId.startsWith("ai_embed_")) {
    try {
      const response = interaction.message.content;
      if (!response) {
        await interaction.reply({
          content: "No response found.",
          flags: 64,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🤖 AI Response")
        .setDescription(
          response.length > 4096
            ? response.substring(0, 4093) + "..."
            : response,
        )
        .setColor("#7289DA" as any)
        .setFooter({
          text: `Requested by ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error("❌ Error handling AI embed button:", error);
      await interaction.reply({
        content: "❌ An error occurred.",
        flags: 64,
      });
    }
    return;
  }

  if (customId.startsWith("ai_reply_")) {
    const userId = customId.replace("ai_reply_", "");

    const modal = new ModalBuilder()
      .setCustomId(`ai_modal_${userId}`)
      .setTitle("Chat with AI")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("ai_message")
            .setLabel("Your message")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Type your message here...")
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
    return;
  }
}

async function handleModalInteraction(interaction: any): Promise<void> {
  const customId = interaction.customId ?? "";

  if (customId.startsWith("ai_modal_")) {
    const userId = customId.replace("ai_modal_", "");
    const message = interaction.fields.getTextInputValue("ai_message");

    await interaction.deferUpdate();

    try {
      const { chatWithAI } = await import("../../services/aiService");
      const { config: botConfig } = await import("../../config/index");

      if (!botConfig.huggingfaceApiKey) {
        await interaction.followUp({
          content: "AI is not configured.",
          flags: 64,
        });
        return;
      }

      const response = await chatWithAI(message, userId);

      const embed = new EmbedBuilder()
        .setDescription(
          response.length > 4096
            ? response.substring(0, 4093) + "..."
            : response,
        )
        .setColor("#7289DA")
        .setFooter({
          text: `${interaction.user.tag} • Reply to continue`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      const replyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ai_reply_${userId}`)
          .setLabel("💬 Reply")
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.followUp({
        embeds: [embed],
        components: [replyButton],
      });
    } catch (error) {
      await interaction.followUp({
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: 64,
      });
    }
    return;
  }
}
