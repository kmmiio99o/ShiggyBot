import { Client, GatewayIntentBits } from "discord.js";
import { config } from "../config";

/**
 * Creates and configures the Discord.js client with required intents
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  return client;
}
