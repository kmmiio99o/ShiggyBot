import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  EmbedBuilder,
} from "discord.js";
import { SlashCommand } from "../types";
import { chatWithGemini, clearHistory } from "../../services/geminiService.js";
import { config } from "../../config/index.js";

const aiSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Chat with AI")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Your message to the AI")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("clear")
        .setDescription("Clear conversation history")
        .setRequired(false),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!config.geminiApiKey) {
      await interaction.reply({
        content: "AI is not configured. Bot owner needs to set an API key.",
        flags: 64,
      });
      return;
    }

    const message = interaction.options.getString("message", true);
    const clear = interaction.options.getBoolean("clear") ?? false;
    const userId = interaction.user.id;

    if (clear) {
      clearHistory(userId);
      await interaction.reply({
        content: "✅ Conversation history cleared!",
        flags: 64,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const response = await chatWithGemini(message, userId);

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

      await interaction.editReply({
        embeds: [embed],
        components: [replyButton],
      });
    } catch (error) {
      await interaction.editReply({
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
};

export default aiSlashCommand;
