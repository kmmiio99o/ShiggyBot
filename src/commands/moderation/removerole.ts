import {
  Message,
  PermissionsBitField,
  Role,
  EmbedBuilder,
  GuildMember,
} from "discord.js";

/**
 * Remove role from a member - standalone implementation.
 *
 * Usage:
 *   Sremoverole <user> <role>
 *
 * - Role can be a mention (<@&id>), raw ID, or exact/partial name.
 * - User can be a mention (<@id>), raw ID, username, or display name (best-effort).
 *
 * Replies are sent as embeds for consistent UX.
 */

const EXAMPLES = [
  "Sremoverole @user @&123456789012345678",
  "Sremoverole 123456789012345678 987654321098765432",
];

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
        (err2 as any)?.message ?? String(err2),
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
  token: string | undefined,
): Promise<Role | null> {
  if (!message.guild || !token) return null;

  const id = resolveRoleIdFromToken(token);
  if (id) {
    try {
      const role = await message.guild.roles.fetch(id);
      if (role) return role;
    } catch {
      // fallthrough to name search
    }
  }

  const name = token.trim().toLowerCase();
  const exact = message.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === name,
  );
  if (exact) return exact;

  const partial = message.guild.roles.cache.find((r) =>
    r.name.toLowerCase().includes(name),
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

async function findMemberByToken(
  message: Message,
  token: string | undefined,
): Promise<GuildMember | null> {
  if (!message.guild || !token) return null;
  const id = resolveMemberIdFromToken(token);
  if (id) {
    try {
      return await message.guild.members.fetch(id);
    } catch {
      return null;
    }
  }

  const q = token.toLowerCase();
  const found = message.guild.members.cache.find((m) => {
    const username = m.user.username.toLowerCase();
    const tag = `${m.user.username}#${m.user.discriminator}`.toLowerCase();
    const display = (m.displayName || "").toLowerCase();
    return username === q || tag === q || display === q;
  });
  return found ?? null;
}

export default async function runRemoveRole(
  message: Message,
  args: string[],
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

  let member = null;
  let roleToken = "";

  if (message.reference && message.reference.messageId) {
    try {
      const repliedMessage = await message.channel.messages.fetch(
        message.reference.messageId,
      );
      if (repliedMessage && repliedMessage.member) {
        member = repliedMessage.member;
        roleToken = args.join(" ");
      }
    } catch (err) {
      console.warn("Could not fetch replied message:", err);
    }
  }

  if (!member) {
    const targetToken = args[0];
    roleToken = args.slice(1).join(" ");
    if (targetToken) {
      member = await findMemberByToken(message, targetToken);
    }
  }

  if (!member || !roleToken) {
    await safeReply(
      message,
      "Usage: `Sremoverole <user> <role>`.\nYou can also reply to a user and use `Sremoverole <role name>`.",
    );
    return;
  }

  const role = await findRole(message, roleToken);
  if (!role) {
    await safeReply(
      message,
      "Could not find the specified role. Provide a role mention, ID, or exact name.",
    );
    return;
  }

  // Safety: verify the member has the role
  if (!member.roles.cache.has(role.id)) {
    await safeReply(
      message,
      `**${member.user.tag}** does not have the role **${role.name}**.`,
    );
    return;
  }

  // Bot role hierarchy check
  const botHighest = bot.roles?.highest;
  if (botHighest && botHighest.position <= role.position) {
    await safeReply(
      message,
      "I cannot remove that role because my highest role is not higher than the target role. Adjust role hierarchy.",
    );
    return;
  }

  // Invoker hierarchy check (optional)
  const authorHighest = author.roles?.highest;
  if (
    authorHighest &&
    authorHighest.position <= role.position &&
    author.id !== message.guild.ownerId
  ) {
    await safeReply(
      message,
      "You cannot remove that role because it is equal or higher than your highest role.",
    );
    return;
  }

  try {
    await member.roles.remove(role);
    await safeReply(
      message,
      `Removed role **${role.name}** from **${member.user.tag}**.`,
    );
  } catch (err: any) {
    console.error("runRemoveRole error:", err);
    await safeReply(
      message,
      `Failed to remove role: ${err?.message ?? String(err)}`,
    );
  }
}
