/**
 * ShiggyBot/src/events/guildMemberAdd.ts
 *
 * Registers a guildMemberAdd listener that automatically assigns a configured
 * role to new members when they join.
 *
 * Configuration:
 * - WELCOME_ROLE_ID (optional) — role ID to assign to new members.
 *     Defaults to "1427396865711673484" (the `shigger` role you requested).
 *
 * Behavior:
 * - On member join, attempts to add the configured role.
 * - Performs checks for the bot's Manage Roles permission and role hierarchy.
 * - Logs helpful messages on success/failure but will not throw.
 *
 * Usage:
 * import { setupAutoRole } from './events/autorole';
 * setupAutoRole(client);
 */

import { Client, GuildMember, PermissionsBitField, Role } from "discord.js";

/**
 * Attach the guildMemberAdd handler to the provided client.
 * Returns a function to remove the listener (cleanup).
 */
export function setupAutoRole(client: Client): () => void {
  const roleId = process.env.WELCOME_ROLE_ID ?? "1427396865711673484";

  // Handler function
  const onGuildMemberAdd = async (member: GuildMember) => {
    try {
      // Ensure this is a proper guild member (should be)
      const guild = member.guild;
      if (!guild) {
        console.warn("guildMemberAdd: member.guild is not available.");
        return;
      }

      // Ensure bot has guild member info
      const me = guild.members.me;
      if (!me) {
        console.warn("guildMemberAdd: bot user not available in guild yet.");
        return;
      }

      // Permission check: ManageRoles is required to add roles
      if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        console.warn(
          `guildMemberAdd: missing ManageRoles permission in guild ${guild.id}. Cannot assign role ${roleId}.`
        );
        return;
      }

      // Fetch role (try cache then API)
      // `guild.roles.cache.get` returns `Role | undefined` while `guild.roles.fetch` returns `Role | null`.
      // Declare `role` explicitly to allow `Role | null | undefined` to avoid assignment errors.
      let role: Role | null | undefined = guild.roles.cache.get(roleId);
      if (!role) {
        try {
          role = await guild.roles.fetch(roleId);
        } catch (err) {
          console.warn(`autorole: failed to fetch role ${roleId}:`, err);
          role = undefined;
        }
      }

      if (!role) {
        console.warn(
          `guildMemberAdd: role ${roleId} not found in guild ${guild.id}.`
        );
        return;
      }

      // Ensure bot's highest role is above the target role
      const botHighest = me.roles?.highest;
      if (botHighest && botHighest.position <= role.position) {
        console.warn(
          `guildMemberAdd: cannot assign role ${role.name}(${role.id}) because bot's highest role is not above it.`
        );
        return;
      }

      // If member already has the role, nothing to do
      if (member.roles.cache.has(role.id)) {
        console.debug(
          `guildMemberAdd: member ${member.user.tag} already has role ${role.name}.`
        );
        return;
      }

      // Attempt to add the role
      await member.roles.add(role);
      console.log(
        `Assigned role ${role.name} (${role.id}) to new member ${member.user.tag} in guild ${guild.id}.`
      );
    } catch (err: any) {
      // Discord REST errors often include a `code` and `httpStatus`
      console.error(
        "guildMemberAdd: unexpected error while assigning role:",
        err?.message ?? err
      );
    }
  };

  // Attach listener
  client.on("guildMemberAdd", onGuildMemberAdd);

  // Return cleanup function
  return () => {
    client.off("guildMemberAdd", onGuildMemberAdd);
  };
}

export default setupAutoRole;
