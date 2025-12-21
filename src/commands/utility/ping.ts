import { Message } from "discord.js";
import { PrefixCommand } from "../types";

const pingCommand: PrefixCommand = {
  name: "ping",
  description: "Checks the bot's latency.",
  async execute(message: Message) {
    const sent = await message.reply("Pinging...");
    const latency = sent.createdTimestamp - message.createdTimestamp;
    await sent.edit(
      `Pong! Latency: ${latency}ms. API Latency: ${Math.round(message.client.ws.ping)}ms`,
    );
  },
};

export default pingCommand;
