import { Client } from "discord.js";
import { setupReadyHandler } from "./ready";
import { setupMessageHandler } from "./message";
import { setupInteractionHandler } from "./interaction";

/**
 * Sets up all event handlers for the Discord client
 * Returns cleanup function to remove all listeners
 */
export function setupEvents(client: Client): () => void {
  const readyCleanup = setupReadyHandler(client);
  const messageCleanup = setupMessageHandler(client);
  const interactionCleanup = setupInteractionHandler(client);

  return () => {
    readyCleanup();
    messageCleanup();
    interactionCleanup();
  };
}
