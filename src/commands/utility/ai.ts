import { Message, EmbedBuilder } from "discord.js";
import { PrefixCommand } from "../types";
import { chatWithGemini, clearHistory } from "../../services/geminiService";
import { config } from "../../config/index";

const aiCommand: PrefixCommand = {
  name: "ai",
  description: "Chat with AI",
  aliases: ["gemini", "ask", "clearai"],
  async execute(message: Message, args: string[]) {
    if (!config.geminiApiKey) {
      await message.reply(
        "AI is not configured. Bot owner needs to set an API key.",
      );
      return;
    }

    const userId = message.author.id;

    if (args[0]?.toLowerCase() === "clear") {
      clearHistory(userId);
      await message.reply("✅ Conversation history cleared!");
      return;
    }

    const prompt = args.join(" ");
    if (!prompt) {
      await message.reply(
        "Usage: `Sai <your question>`\nExample: `Sai What is the meaning of life?`",
      );
      return;
    }

    const loadingMsg = await message.reply("🤔 Thinking...");

    try {
      const response = await chatWithGemini(prompt, userId);

      const embed = new EmbedBuilder()
        .setDescription(
          response.length > 4096
            ? response.substring(0, 4093) + "..."
            : response,
        )
        .setColor("#7289DA")
        .setFooter({
          text: `${message.author.tag}`,
          iconURL: message.author.displayAvatarURL(),
        })
        .setTimestamp();

      await loadingMsg.delete();
      await message.reply({ embeds: [embed] });
    } catch (error) {
      await loadingMsg.edit(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
};

export default aiCommand;
