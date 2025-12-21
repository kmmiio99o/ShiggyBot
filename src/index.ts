import "dotenv/config";
import { createClient } from "./bot/client";
import { setupEvents } from "./bot/events";
import { config } from "./config";
import {
  logger,
  initWebhookLogger,
  attachProcessHandlers,
} from "./utils/webhookLogger";

/**
 * Main entry point for ShiggyBot
 * Initializes the bot and starts the Discord client
 */
async function main() {
  console.log("🚀 Starting ShiggyBot...");

  // Initialize webhook logger
  initWebhookLogger(config.logWebhookUrl);
  attachProcessHandlers();

  // Validate configuration
  if (!config.validate()) {
    console.error("❌ Invalid configuration. Exiting...");
    process.exit(1);
  }

  // Create Discord client
  const client = createClient();

  // Setup event handlers
  setupEvents(client);

  // Handle graceful shutdown
  setupShutdownHandlers(client);

  // Login to Discord
  try {
    console.log("🔑 Logging in to Discord...");
    await client.login(config.token);
  } catch (error) {
    console.error("❌ Failed to login to Discord:", error);
    await logger.error(error as Error, { type: "login" });
    process.exit(1);
  }
}

/**
 * Sets up graceful shutdown handlers
 */
function setupShutdownHandlers(client: any) {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
      // Log shutdown
      await logger.info("Bot shutting down", { signal });

      // Destroy Discord client
      if (client.destroy) {
        client.destroy();
        console.log("✅ Discord client destroyed");
      }

      // Additional cleanup if needed
      const { cleanupFeatures } = await import("./bot/events/ready");
      cleanupFeatures();

      console.log("👋 Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Handle different shutdown signals
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGUSR2", () => shutdown("SIGUSR2"));
}

// Start the bot
main().catch(async (error) => {
  console.error("❌ Fatal error in main:", error);
  await logger.error(error, { type: "main" });
  process.exit(1);
});
