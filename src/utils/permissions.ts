import {
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";

/**
 * Permission checking utilities for ShiggyBot
 */

/**
 * Checks if a member has all required permissions
 */
export function hasPermissions(
  member: GuildMember,
  permissions: bigint[],
): boolean {
  if (!member) return false;

  return permissions.every((permission) =>
    member.permissions.has(new PermissionsBitField(permission)),
  );
}

/**
 * Gets missing permissions for a member
 * Returns array of permission names that are missing
 */
export function getMissingPermissions(
  member: GuildMember,
  permissions: bigint[],
): string[] {
  const missing: string[] = [];

  permissions.forEach((permission) => {
    if (!member.permissions.has(new PermissionsBitField(permission))) {
      const permissionName = Object.keys(PermissionFlagsBits).find(
        (key) =>
          PermissionFlagsBits[key as keyof typeof PermissionFlagsBits] ===
          permission,
      );
      missing.push(permissionName || "Unknown");
    }
  });

  return missing;
}

/**
 * Checks bot permissions and returns missing ones
 */
export function checkBotPermissions(
  member: GuildMember,
  permissions: bigint[],
): string[] {
  return getMissingPermissions(member, permissions);
}

/**
 * Common permission sets for command categories
 */
export const PermissionSets = {
  moderation: [
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ModerateMembers,
  ],
  administration: [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageGuildExpressions,
  ],
  utility: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ],
};

/**
 * Creates a permission error embed
 */
export function createPermissionErrorEmbed(missingPermissions: string[]): any {
  return {
    title: "❌ Missing Permissions",
    description: `You need the following permissions:\n\`\`\`\n${missingPermissions.join("\n")}\n\`\`\``,
    color: 0xff5555,
    timestamp: new Date().toISOString(),
  };
}
