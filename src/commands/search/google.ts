import { Message, EmbedBuilder, Colors } from "discord.js";
import { PrefixCommand } from "../types";

const googleCommand: PrefixCommand = {
  name: "google",
  aliases: ["g", "search"],
  description: "Searches Google for a given query.",
  usage: "<query>",
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    if (!args.length) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "🔍 Search Query Required",
            `❌ Please provide something to search for.

**Usage:** \`${process.env.PREFIX || "S"}google <query>\`
**Aliases:** \`g\`, \`search\`
**Example:** \`${process.env.PREFIX || "S"}google how to code in TypeScript\`
**Example:** \`${process.env.PREFIX || "S"}g discord.js documentation\``,
          ),
        ],
      });
      return;
    }

    const query = args.join(" ");
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    const searchEmbed = new EmbedBuilder()
      .setTitle("🔍 Google Search")
      .setColor(Colors.Blue)
      .setDescription(`I've searched Google for: **"${query}"**`)
      .addFields(
        {
          name: "🌐 Search Link",
          value: `[Click here to view results](${googleSearchUrl})`,
          inline: false,
        },
        {
          name: "📝 Query",
          value: `\`\`\`${query}\`\`\``,
          inline: false,
        },
        {
          name: "💡 Tips",
          value:
            "• Use quotes for exact phrases\n• Add `site:` for specific sites\n• Use `-` to exclude words",
          inline: false,
        },
      )
      .setThumbnail(
        "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png",
      )
      .setFooter({
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();

    await message.reply({ embeds: [searchEmbed] });
  },
};

export default googleCommand;
