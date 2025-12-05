import { Client } from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils/webhookLogger";

let isInitialized = false;
const cleanupFunctions: Array<() => void> = [];

/**
 * Handles the 'ready' event when bot successfully connects to Discord
 */
export function setupReadyHandler(client: Client): () => void {
  const handleReady = async () => {
    if (isInitialized) return;
    isInitialized = true;

    console.log(`✅ Logged in as ${client.user?.tag} (${client.user?.id})`);

    try {
      // Initialize all bot features
      await initializeFeatures(client);

      // Log successful startup
      await logger.info("Bot started successfully", {
        guilds: client.guilds.cache.size,
        user: client.user?.tag,
      });
    } catch (error) {
      console.error("❌ Error during initialization:", error);
      await logger.error(error as Error, { type: "initialization" });
    }
  };

  client.on("ready", handleReady);

  return () => {
    client.off("ready", handleReady);
  };
}

/**
 * Initializes all bot features and services
 */
async function initializeFeatures(client: Client) {
  try {
    console.log("🚀 Initializing bot features...");

    // Initialize autorole feature
    try {
      const autoroleModule = await import("../../features/autorole");
      const setupAutoRole =
        autoroleModule.setup || autoroleModule.default?.setup;
      if (typeof setupAutoRole === "function") {
        const cleanup = setupAutoRole(client);
        if (cleanup) cleanupFunctions.push(cleanup);
        console.log("✅ Auto-role feature initialized");
      }
    } catch (error) {
      console.warn("⚠️ Failed to load autorole feature:", error);
    }

    // Initialize presence feature
    try {
      const presenceModule = await import("../../features/presence");
      const startPresence =
        presenceModule.startPresence || presenceModule.default?.startPresence;
      if (typeof startPresence === "function") {
        const cleanup = startPresence(client);
        if (cleanup) cleanupFunctions.push(cleanup);
        console.log("✅ Presence feature initialized");
      }
    } catch (error) {
      console.warn("⚠️ Failed to load presence feature:", error);
    }

    // Initialize prefix commands
    try {
      const { setupPrefixCommands } = await import("../../commands/prefix");
      if (typeof setupPrefixCommands === "function") {
        const cleanup = setupPrefixCommands(client);
        if (cleanup) cleanupFunctions.push(cleanup);
        console.log("✅ Prefix commands initialized");
      }
    } catch (error) {
      console.warn("⚠️ Failed to load prefix commands:", error);
    }

    // Initialize slash commands
    try {
      const { setupSlashCommands } = await import("../../commands/slash");
      if (typeof setupSlashCommands === "function") {
        await setupSlashCommands(client);
        console.log("✅ Slash commands initialized");
      }
    } catch (error) {
      console.warn("⚠️ Failed to load slash commands:", error);
    }
  } catch (error) {
    console.error(
      "❌ A critical error occurred during feature initialization:",
      error,
    );
  }
}

/**
 * Cleanup all registered features
 */
export function cleanupFeatures() {
  cleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  });
  cleanupFunctions.length = 0;
  isInitialized = false;
}
