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

async function sendEmbedReply(
  message: Message,
  opts: {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
  },
) {
  const embed = new EmbedBuilder()
    .setTitle(opts.title ?? "ShiggyBot")
    .setDescription(opts.description ?? "")
    .setColor(opts.color ?? 0xffcc00)
    .setTimestamp();

  if (opts.fields) embed.addFields(...opts.fields);

  try {
    await message.reply({ embeds: [embed] });
  } catch (err) {
    try {
      // Prefer DM fallback to avoid channel-type typing issues (some channel unions
      // don't expose `send` in TS). If DM is not available, fall back to channel send.
      if (
        message.author &&
        typeof (message.author as any).send === "function"
      ) {
        await (message.author as any).send({ embeds: [embed as any] });
      } else {
        await (message.channel as any).send({ embeds: [embed as any] });
      }
    } catch (err2) {
      console.error(
        "removerole: failed to deliver embed reply:",
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
  try {
    if (!message.guild) {
      await sendEmbedReply(message, {
        title: "Command unavailable",
        description: "This command can only be used inside a server.",
        color: 0xff5555,
      });
      return;
    }

    const author = message.member;
    const bot = message.guild.members.me;

    if (!author?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await sendEmbedReply(message, {
        title: "Missing permission",
        description: "You do not have permission to manage roles.",
        color: 0xff5555,
      });
      return;
    }

    if (!bot?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await sendEmbedReply(message, {
        title: "I lack permission",
        description: "I do not have the Manage Roles permission.",
        color: 0xff5555,
      });
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
      await sendEmbedReply(message, {
        title: "Sremoverole — Usage & Examples",
        description:
          "Remove a role from a member. Provide a mention, ID, or name for the role.\nUsage: `Sremoverole <user> <role>`.\nYou can also reply to a user and use `Sremoverole <role name>`.",
        color: 0xffcc00,
        fields: [
          {
            name: "Examples",
            value: EXAMPLES.map((e) => `\`${e}\``).join("\n"),
            inline: false,
          },
        ],
      });
      return;
    }

    const role = await findRole(message, roleToken);
    if (!role) {
      await sendEmbedReply(message, {
        title: "Role not found",
        description:
          "Could not find the specified role. Provide a role mention, ID, or exact name.",
        color: 0xffcc00,
      });
      return;
    }

    // Safety: verify the member has the role
    if (!member.roles.cache.has(role.id)) {
      await sendEmbedReply(message, {
        title: "User does not have role",
        description: `${member.user.tag} does not have the role **${role.name}**.`,
        color: 0xffcc00,
      });
      return;
    }

    // Bot role hierarchy check
    const botHighest = bot.roles?.highest;
    if (botHighest && botHighest.position <= role.position) {
      await sendEmbedReply(message, {
        title: "Cannot remove role",
        description:
          "I cannot remove that role because my highest role is not higher than the target role. Adjust role hierarchy.",
        color: 0xff5555,
        fields: [
          {
            name: "Hint",
            value:
              "Make my role higher than the target role in server settings.",
          },
        ],
      });
      return;
    }

    // Invoker hierarchy check (optional)
    const authorHighest = author.roles?.highest;
    if (
      authorHighest &&
      authorHighest.position <= role.position &&
      author.id !== message.guild.ownerId
    ) {
      await sendEmbedReply(message, {
        title: "Cannot remove role",
        description:
          "You cannot remove that role because it is equal or higher than your highest role.",
        color: 0xff5555,
      });
      return;
    }

    try {
      await member.roles.remove(role);
      await sendEmbedReply(message, {
        title: "Role removed",
        description: `Removed role **${role.name}** from **${member.user.tag}**.`,
        color: 0x22aa55,
        fields: [
          { name: "Moderator", value: `${author.user.tag}`, inline: true },
          { name: "Role", value: `${role.name}`, inline: true },
        ],
      });
    } catch (err: any) {
      console.error("runRemoveRole error:", err);
      await sendEmbedReply(message, {
        title: "Failed to remove role",
        description: `Failed to remove role: ${
          (err as any)?.message ?? String(err)
        }`,
        color: 0xff5555,
      });
    }
  } catch (err: any) {
    console.error("runRemoveRole: unexpected error:", err);
    await sendEmbedReply(message, {
      title: "Error",
      description:
        "An unexpected error occurred while processing the remove-role command.",
      color: 0xff5555,
    });
  }
}
