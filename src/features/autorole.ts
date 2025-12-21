import { Client, GuildMember, PermissionsBitField } from "discord.js";
import { config } from "../config";
import { logger } from "../utils/webhookLogger";

/**
 * Attach the guildMemberAdd handler to the provided client.
 * Returns a function to remove the listener (cleanup).
 *
 * Behaviour:
 * - When a new member joins, attempts to apply the configured welcome role
 *   specified by `config.welcomeRoleId`.
 * - Silently no-ops if the role is not configured or cannot be found.
 * - Logs errors to console and webhook logger for observability.
 */
export function setupAutoRole(client: Client): () => void {
  const handler = async (member: GuildMember) => {
    try {
      // Ensure we are operating in a guild context
      if (!member.guild) return;

      const roleRef = config.welcomeRoleId;
      if (!roleRef) return;

      // Try to resolve role by ID first, then by name (tolerant)
      let role =
        member.guild.roles.cache.get(roleRef) ||
        member.guild.roles.cache.find((r) => r.name === roleRef);

      if (!role) {
        // Role not present in cache; try a fetch as a last resort (best-effort)
        try {
          const fetched = await member.guild.roles
            .fetch(roleRef)
            .catch(() => null);
          if (fetched) role = fetched;
        } catch {
          // ignore fetch errors
        }
      }

      if (!role) {
        console.warn(
          `⚠️ Welcome role (${roleRef}) configured but not found in guild ${member.guild.id}`,
        );
        return;
      }

      // Check bot permissions before attempting to add role
      const me = member.guild.members.me;
      if (me && !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        console.warn(
          `⚠️ Cannot assign welcome role in guild ${member.guild.id} — missing ManageRoles permission`,
        );
        return;
      }

      // Avoid adding if the member already has the role for any reason
      if (member.roles.cache.has(role.id)) return;

      await member.roles.add(role);
      console.log(
        `✅ Assigned welcome role ${role.id} to user ${member.id} in guild ${member.guild.id}`,
      );
    } catch (error) {
      console.error("❌ Error in autorole handler:", error);
      await logger
        .error(error as Error, {
          type: "autorole",
          userId: member.id,
          guildId: member.guild?.id,
        })
        .catch(() => {});
    }
  };

  client.on("guildMemberAdd", handler);

  return () => {
    client.off("guildMemberAdd", handler);
  };
}

/**
 * Setup function for event system
 */
export function setup(client: Client): () => void {
  return setupAutoRole(client);
}

// Ensure default export for dynamic imports
export default { setupAutoRole, setup };
