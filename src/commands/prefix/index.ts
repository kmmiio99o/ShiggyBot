import { Client, Message } from "discord.js";
import { config } from "../../config";

// Command handler map
const commandHandlers = new Map<
  string,
  (message: Message, args: string[]) => Promise<void>
>();

// Main prefix command handler
export async function handlePrefixCommand(
  message: Message,
  commandName: string,
  args: string[],
): Promise<void> {
  const handler = commandHandlers.get(commandName);
  if (handler) {
    await handler(message, args);
  } else {
    console.log(`Unknown prefix command: ${commandName}`);
  }
}

// Setup function
export function setupPrefixCommands(client: Client): () => void {
  console.log("Setting up prefix commands");

  const messageHandler = async (message: Message) => {
    if (message.author.bot || !message.content) return;

    if (message.content.toLowerCase().startsWith(config.prefix.toLowerCase())) {
      const content = message.content.slice(config.prefix.length).trim();
      const args = content.split(/\s+/);
      const commandName = args.shift()?.toLowerCase();

      if (commandName) {
        await handlePrefixCommand(message, commandName, args);
      }
    }
  };

  client.on("messageCreate", messageHandler);

  // Return cleanup function
  return () => {
    client.off("messageCreate", messageHandler);
  };
}

// Alias for compatibility
export const setup = setupPrefixCommands;
