import "dotenv/config";

/**
 * Configuration management for ShiggyBot
 * Centralizes all environment variables and configuration
 */
export const config = {
  // Core
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  devGuildId: process.env.DEV_GUILD_ID,

  // Commands
  prefix: process.env.PREFIX?.trim() || "S",

  // Features
  welcomeRoleId: process.env.WELCOME_ROLE_ID || "1427396865711673484",

  // Presence - FIXED: Properly parse the status
  get presenceStatus(): "online" | "idle" | "dnd" | "invisible" {
    const status = (process.env.PRESENCE_STATUS || "idle").toLowerCase();
    const validStatuses = ["online", "idle", "dnd", "invisible"];
    return validStatuses.includes(status) ? (status as any) : "idle";
  },

  presenceInterval: Math.max(15, Number(process.env.PRESENCE_INTERVAL || "15")),
  presenceActivities: process.env.PRESENCE_ACTIVITIES,

  // Webhooks & Services
  logWebhookUrl: process.env.LOG_WEBHOOK_URL,
  dashboardPort: process.env.DASHBOARD_PORT
    ? parseInt(process.env.DASHBOARD_PORT, 10)
    : 14150,

  /**
   * Validates the configuration
   * Returns true if valid, false otherwise
   */
  validate(): boolean {
    const errors: string[] = [];

    // Required environment variables
    if (!this.token) errors.push("DISCORD_TOKEN is required");
    if (!this.clientId) errors.push("CLIENT_ID is required");

    // Log errors
    if (errors.length > 0) {
      console.error("❌ Configuration errors:");
      errors.forEach((error) => console.error(`   - ${error}`));
      return false;
    }

    // Log successful configuration
    console.log("Configuration loaded successfully");
    console.log(`Prefix: ${this.prefix}`);
    console.log(`Client ID: ${this.clientId}`);
    console.log(`Welcome Role: ${this.welcomeRoleId}`);
    console.log(
      `   Presence: ${this.presenceStatus} (${this.presenceInterval}s)`,
    );
    console.log(`Dashboard Port: ${this.dashboardPort}`);

    return true;
  },
};
