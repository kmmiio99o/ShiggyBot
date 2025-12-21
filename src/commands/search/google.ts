import { Message } from "discord.js";
import { PrefixCommand } from "../../types";

const googleCommand: PrefixCommand = {
  name: "google",
  aliases: ["g", "search"],
  description: "Searches Google for a given query.",
  usage: "<query>",
  async execute(message: Message, args: string[]) {
    if (!args.length) {
      await message.reply("Please provide something to search for.");
      return;
    }

    const query = args.join(" ");
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    await message.reply(`Here's what I found on Google for "${query}":\n${googleSearchUrl}`);
  },
};

export default googleCommand;
