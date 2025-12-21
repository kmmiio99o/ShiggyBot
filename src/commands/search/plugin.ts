import { Message } from "discord.js";
import { PrefixCommand } from "../types";
import { handlePluginSearch } from "../../services/pluginService";

const pluginCommand: PrefixCommand = {
  name: "plugin",
  aliases: ["plugins", "plg"],
  description: "Searches for plugins and displays their information.",
  usage: "<plugin name>",
  async execute(message: Message, args: string[]) {
    await handlePluginSearch(message, args);
  },
};

export default pluginCommand;
