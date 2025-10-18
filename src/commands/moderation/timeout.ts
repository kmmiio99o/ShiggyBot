import { Message, PermissionsBitField } from "discord.js";

/**
 * Timeout (moderation) command
 *
 * Usage:
 *   Stimeout <user> <duration> [reason...]
 *
 * Duration formats:
 *   - 10s (seconds)
 *   - 5m  (minutes)
 *   - 2h  (hours)
 *   - 1d  (days)
 *   - 15  (plain number interpreted as minutes)
 *
 * Notes:
 * - Requires the invoker to have ModerateMembers permission.
 * - The bot must also have ModerateMembers permission.
 * - Discord timeout maximum is 28 days (in milliseconds). We enforce that.
 *
 * Examples (used when a user invokes the command without arguments):
 *  - Stimeout @user 10m Spamming
 *  - Stimeout 123456789012345678 1h Cleanup
 */

export const EXAMPLES = [
  "Stimeout @user 10m Spamming",
  "Stimeout 123456789012345678 1h Cleanup",
];

function parseDurationToMs(input: string): number | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();

  // plain number -> minutes
  if (/^\d+$/.test(s)) {
    return Number(s) * 60_000;
  }

  const m = s.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2];

  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export default async function runTimeout(
  message: Message,
  args: string[]
): Promise<void> {
  // Helper that attempts to reply with an embed, falling back to channel send or plain text
  async function sendEmbedReply(
    message: Message,
    opts: {
      title?: string;
      description?: string;
      color?: number;
      fields?: { name: string; value: string; inline?: boolean }[];
    }
  ) {
    const embed = {
      title: opts.title ?? "ShiggyBot",
      description: opts.description ?? "",
      color: opts.color ?? 0xffcc00,
      fields: opts.fields ?? [],
      timestamp: new Date().toISOString(),
    } as any;

    try {
      await message.reply({ embeds: [embed] as any });
    } catch (err) {
      try {
        await (message.channel as any).send({ embeds: [embed] as any });
      } catch {
        try {
          await message.reply(opts.description ?? opts.title ?? "");
        } catch {
          // give up
        }
      }
    }
  }

  try {
    if (!message.guild) {
      await sendEmbedReply(message, {
        title: "Command unavailable",
        description: "This command can only be used in a server.",
        color: 0xff5555,
      });
      return;
    }

    const author = message.member;
    const me = message.guild.members.me;

    if (!author) {
      await sendEmbedReply(message, {
        title: "Member info missing",
        description: "Could not determine your member information.",
        color: 0xff5555,
      });
      return;
    }

    // Permission checks
    if (!author.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await sendEmbedReply(message, {
        title: "Missing permission",
        description:
          "You do not have permission to timeout members (Moderate Members).",
        color: 0xff5555,
      });
      return;
    }
    if (!me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await sendEmbedReply(message, {
        title: "I lack permission",
        description:
          "I do not have permission to timeout members. Please grant me the Moderate Members permission.",
        color: 0xff5555,
      });
      return;
    }

    const targetToken = args[0];
    const durationToken = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    if (!targetToken || !durationToken) {
      // Provide usage plus examples stored in this command file — embed
      await sendEmbedReply(message, {
        title: "Stimeout — Usage & Examples",
        description:
          "Apply a timeout to a member. Provide a mention or a user ID and a duration.",
        color: 0xffcc00,
        fields: [
          {
            name: "Usage",
            value: "`Stimeout <user> <duration> [reason]`",
            inline: false,
          },
          {
            name: "Examples",
            value: EXAMPLES.map((e) => `\`${e}\``).join("\n"),
            inline: false,
          },
        ],
      });
      return;
    }

    // Resolve ID from mention or raw ID
    const mentionMatch = targetToken.match(/^<@!?(\d+)>$/);
    const id = mentionMatch
      ? mentionMatch[1]
      : targetToken.replace(/[<@!>]/g, "");
    if (!/^\d+$/.test(id)) {
      await sendEmbedReply(message, {
        title: "Invalid target",
        description: "Please provide a valid user mention or user ID.",
        color: 0xffcc00,
        fields: [{ name: "Example", value: "`Stimeout @user 10m`" }],
      });
      return;
    }

    // Fetch target member
    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(id);
    } catch {
      targetMember = null;
    }

    if (!targetMember) {
      await sendEmbedReply(message, {
        title: "Member not found",
        description: "Could not find that member in this server.",
        color: 0xffcc00,
      });
      return;
    }

    // Prevent timing out yourself, the bot, or the server owner
    if (targetMember.id === message.client.user?.id) {
      await sendEmbedReply(message, {
        title: "Operation blocked",
        description: "I will not timeout myself.",
        color: 0xffaa00,
      });
      return;
    }
    if (targetMember.id === author.id) {
      await sendEmbedReply(message, {
        title: "Operation blocked",
        description: "You cannot timeout yourself.",
        color: 0xffaa00,
      });
      return;
    }
    if (message.guild.ownerId === targetMember.id) {
      await sendEmbedReply(message, {
        title: "Operation blocked",
        description: "I cannot timeout the server owner.",
        color: 0xffaa00,
      });
      return;
    }

    // Parse duration
    const ms = parseDurationToMs(durationToken);
    if (ms === null) {
      await sendEmbedReply(message, {
        title: "Invalid duration",
        description:
          "Invalid duration format. Use e.g. `10m`, `1h`, `30s`, `2d` or a plain number for minutes.",
        color: 0xffcc00,
      });
      return;
    }

    // Discord maximum timeout is 28 days
    const MAX_MS = 28 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) {
      await sendEmbedReply(message, {
        title: "Duration too long",
        description: "Duration too long. Maximum timeout is 28 days.",
        color: 0xff5555,
      });
      return;
    }

    // Check role hierarchy: bot's highest role must be higher than target's highest role
    const botHighest = me.roles?.highest;
    if (
      botHighest &&
      targetMember.roles.highest.position >= botHighest.position
    ) {
      await sendEmbedReply(message, {
        title: "Cannot timeout",
        description: "I cannot timeout that member due to role hierarchy.",
        color: 0xff5555,
        fields: [
          {
            name: "Hint",
            value:
              "Ensure my role is higher than the target and I have the Moderate Members permission.",
          },
        ],
      });
      return;
    }

    // Attempt to apply timeout
    try {
      await targetMember.timeout(ms, reason);
      await sendEmbedReply(message, {
        title: "Member timed out",
        description: `${targetMember.user.tag} has been timed out.`,
        color: 0x22aa55,
        fields: [
          { name: "Moderator", value: `${author.user.tag}`, inline: true },
          { name: "Duration", value: `${durationToken}`, inline: true },
          { name: "Reason", value: `${reason}`, inline: false },
        ],
      });
    } catch (err: any) {
      console.error("runTimeout: failed to timeout member:", err);
      await sendEmbedReply(message, {
        title: "Timeout failed",
        description: `Failed to timeout member: ${err?.message ?? String(err)}`,
        color: 0xff5555,
      });
    }
  } catch (err: any) {
    console.error("runTimeout: unexpected error:", err);
    await sendEmbedReply(message, {
      title: "Error",
      description:
        "An unexpected error occurred while processing the timeout command.",
      color: 0xff5555,
    });
  }
}
