import { Message, PermissionsBitField, Role, EmbedBuilder } from "discord.js";

/**
 *
 * Exports:
 * - default: runAddRole(message, args)
 *
 * Usage (via prefix loader):
 *   import runAddRole from './commands/moderation/addrole';
 *
 * Expected args:
 *  - addrole: <user> <role>
 *
 * Role resolution supports:
 *  - role mention: <@&ROLEID>
 *  - raw role ID: 123456789012345678
 *  - exact role name (case-insensitive match)
 *
 * Examples included below are displayed when a user invokes the command without arguments.
 */

const EXAMPLES = {
  addrole: [
    "Saddrole @user @&123456789012345678",
    "Saddrole 123456789012345678 987654321098765432",
  ],
};

async function safeReply(message: Message, content: string) {
  // Send responses as an embed for clearer, consistent UX.
  const embed = new EmbedBuilder()
    .setTitle("ShiggyBot")
    .setDescription(content)
    .setColor(0xffcc00)
    .setTimestamp();

  try {
    // Prefer replying (keeps context); if that fails, try DMing the command author.
    await message.reply({ embeds: [embed] });
  } catch (err) {
    try {
      // Send the embed as a direct message to the command author as a fallback.
      // (Some channels may block bot messages or replies; DMs are a reasonable fallback.)
      if (
        message.author &&
        typeof (message.author as any).send === "function"
      ) {
        await (message.author as any).send({ embeds: [embed as any] });
      } else {
        // If DM is not available (weird type), attempt channel send as last resort with cast.
        await (message.channel as any).send({ embeds: [embed as any] });
      }
    } catch (err2) {
      // If sending the embed fails, log the error and do not fall back to plain text.
      console.error(
        "safeReply: failed to deliver embed reply:",
        (err2 as any)?.message ?? String(err2)
      );
    }
  }
}

function resolveRoleIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const m = token.match(/^<@&?(\d+)>$/);
  if (m) return m[1];
  const cleaned = token.replace(/[<@&>]/g, "");
  if (/^\d+$/.test(cleaned)) return cleaned;
  return null;
}

async function findRole(
  message: Message,
  token: string | undefined
): Promise<Role | null> {
  if (!message.guild || !token) return null;

  // Try mention or ID first
  const id = resolveRoleIdFromToken(token);
  if (id) {
    try {
      const role = await message.guild.roles.fetch(id);
      if (role) return role;
    } catch {
      // fallthrough to name search
    }
  }

  // Try by exact name (case-insensitive)
  const name = token.trim().toLowerCase();
  const found = message.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === name
  );
  if (found) return found;

  // Try partial name match (contains)
  const partial = message.guild.roles.cache.find((r) =>
    r.name.toLowerCase().includes(name)
  );
  if (partial) return partial;

  return null;
}

function resolveMemberIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const m = token.match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  const cleaned = token.replace(/[<@!>]/g, "");
  if (/^\d+$/.test(cleaned)) return cleaned;
  return null;
}

async function findMemberByToken(message: Message, token: string | undefined) {
  if (!message.guild || !token) return null;
  const id = resolveMemberIdFromToken(token);
  if (id) {
    try {
      return await message.guild.members.fetch(id);
    } catch {
      return null;
    }
  }

  // fallback to search by username or displayName (best-effort)
  const q = token.toLowerCase();
  const found = message.guild.members.cache.find((m) => {
    const username = m.user.username.toLowerCase();
    const tag = `${m.user.username}#${m.user.discriminator}`.toLowerCase();
    const display = (m.displayName || "").toLowerCase();
    return username === q || tag === q || display === q;
  });
  return found ?? null;
}

/**
 * Add role to a member
 */
export default async function runAddRole(
  message: Message,
  args: string[]
): Promise<void> {
  if (!message.guild) {
    await safeReply(message, "This command can only be used inside a server.");
    return;
  }

  const author = message.member;
  const bot = message.guild.members.me;

  if (!author?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await safeReply(message, "You do not have permission to manage roles.");
    return;
  }

  if (!bot?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await safeReply(message, "I do not have the Manage Roles permission.");
    return;
  }

  const targetToken = args[0];
  const roleToken = args[1];

  if (!targetToken || !roleToken) {
    await safeReply(
      message,
      "Usage: Saddrole <user> <role>. Role can be mention, ID, or name."
    );
    return;
  }

  const member = await findMemberByToken(message, targetToken);
  if (!member) {
    await safeReply(
      message,
      "Could not find the specified user in this server."
    );
    return;
  }

  const role = await findRole(message, roleToken);
  if (!role) {
    await safeReply(
      message,
      "Could not find the specified role. Provide a role mention, ID, or exact name."
    );
    return;
  }

  // Prevent self-targeting weirdness
  if (member.id === message.client.user?.id) {
    await safeReply(message, "I will not modify my own roles.");
    return;
  }

  // Role hierarchy: bot's highest role must be higher than the role to manage it
  const botHighest = bot.roles?.highest;
  if (botHighest && botHighest.position <= role.position) {
    await safeReply(
      message,
      "I cannot assign that role because my highest role is not higher than the target role. Adjust role hierarchy."
    );
    return;
  }

  // Also ensure the invoker can manage the role (optional: check invoker's highest role)
  const authorHighest = author.roles?.highest;
  if (
    authorHighest &&
    authorHighest.position <= role.position &&
    author.id !== message.guild.ownerId
  ) {
    await safeReply(
      message,
      "You cannot assign that role because it is equal or higher than your highest role."
    );
    return;
  }

  try {
    await member.roles.add(role);
    await safeReply(
      message,
      `Added role **${role.name}** to **${member.user.tag}**.`
    );
  } catch (err: any) {
    console.error("runAddRole error:", err);
    await safeReply(
      message,
      `Failed to add role: ${err?.message ?? String(err)}`
    );
  }
}
