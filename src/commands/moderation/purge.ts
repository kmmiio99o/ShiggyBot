import {
  Message,
  EmbedBuilder,
  PermissionsBitField,
  TextChannel,
  Collection,
  User,
} from "discord.js";

const EXAMPLES = [
  "Spurge 10",
  "Spurge 25 @user",
  "Spurge 50 123456789012345678",
];

/**
 * Send an embed to the channel (as a normal channel message, not a reply).
 * If channel send fails, fall back to DM the author.
 * Always disable allowedMentions so the sent embed does not mention anyone.
 */
async function sendEmbedToChannelOrDM(
  channel: TextChannel | any,
  author: User | null | undefined,
  embed: EmbedBuilder,
) {
  try {
    if (channel && typeof (channel as any).send === "function") {
      await (channel as any).send({
        embeds: [embed as any],
        allowedMentions: { parse: [] },
      });
      return;
    }
  } catch {
    // ignore and fall back to DM
  }

  try {
    if (author && typeof (author as any).send === "function") {
      await (author as any).send({
        embeds: [embed as any],
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    // final fallback: log for server-side visibility
    console.error(
      "sendEmbedToChannelOrDM: failed to deliver embed:",
      (err as any)?.message ?? err,
    );
  }
}

function resolveMemberIdFromToken(token?: string): string | null {
  if (!token) return null;
  const m = token.match(/^<@!?(\\d+)>$/);
  if (m) return m[1];
  const cleaned = token.replace(/[<@!>]/g, "");
  if (/^\\d+$/.test(cleaned)) return cleaned;
  return null;
}

async function findMemberByToken(message: Message, token?: string) {
  if (!message.guild || !token) return null;

  const id = resolveMemberIdFromToken(token);
  if (id) {
    try {
      return await message.guild.members.fetch(id);
    } catch {
      // fall through to name search
    }
  }

  const q = token.toLowerCase();
  const found =
    message.guild.members.cache.find((m) => {
      const username = (m.user.username || "").toLowerCase();
      const tag = `${m.user.username}#${m.user.discriminator}`.toLowerCase();
      const display = (m.displayName || "").toLowerCase();
      return (
        username === q ||
        tag === q ||
        display === q ||
        username.includes(q) ||
        display.includes(q)
      );
    }) ?? null;

  return found;
}

export default async function runPurge(
  message: Message,
  args: string[],
): Promise<void> {
  try {
    // must be in a guild
    if (!message.guild) {
      const embed = new EmbedBuilder()
        .setTitle("Command unavailable")
        .setDescription("This command can only be used in a server.")
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(message.channel, message.author, embed);
      return;
    }

    const authorMember = message.member;
    const botMember = message.guild.members.me;

    if (
      !authorMember?.permissions.has(PermissionsBitField.Flags.ManageMessages)
    ) {
      const embed = new EmbedBuilder()
        .setTitle("Missing permission")
        .setDescription("You do not have permission to manage messages.")
        .addFields({ name: "Required", value: "Manage Messages", inline: true })
        .setColor(0xff5555)
        .setTimestamp();
      await sendEmbedToChannelOrDM(message.channel, message.author, embed);
      return;
    }

    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      const embed = new EmbedBuilder()
        .setTitle("I lack permission")
        .setDescription("I do not have the Manage Messages permission.")
        .setColor(0xff5555)
        .setTimestamp();
      await sendEmbedToChannelOrDM(message.channel, message.author, embed);
      return;
    }

    const channel = message.channel as TextChannel | any;
    if (!channel || typeof channel.messages?.fetch !== "function") {
      const embed = new EmbedBuilder()
        .setTitle("Unsupported channel")
        .setDescription("This command must be used in a text channel.")
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }

    // If no args provided, show usage/examples (user asked for that)
    const countToken = args[0];
    if (!countToken) {
      const embed = new EmbedBuilder()
        .setTitle("Spurge — Usage & Examples")
        .setDescription(
          "Delete recent messages in this channel. Provide a count (1-100).",
        )
        .addFields(
          { name: "Usage", value: "`Spurge <count> [user]`", inline: false },
          {
            name: "Examples",
            value: EXAMPLES.map((e) => `\`${e}\``).join("\n"),
            inline: false,
          },
        )
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }

    const parsed = parseInt(countToken, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      const embed = new EmbedBuilder()
        .setTitle("Invalid count")
        .setDescription("Count must be a number between 1 and 100.")
        .addFields({ name: "Example", value: "`Spurge 25`" })
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }

    const targetCount = Math.max(1, Math.min(100, parsed));

    // optional user
    let targetMemberId: string | null = null;
    if (args[1]) {
      const possible = resolveMemberIdFromToken(args[1]);
      if (possible) {
        targetMemberId = possible;
      } else {
        const found = await findMemberByToken(message, args[1]);
        if (found) targetMemberId = found.id;
        else {
          const embed = new EmbedBuilder()
            .setTitle("Invalid user")
            .setDescription(
              "Could not resolve the specified user. Provide a mention, ID, or exact username/display name.",
            )
            .setColor(0xffcc00)
            .setTimestamp();
          await sendEmbedToChannelOrDM(channel, message.author, embed);
          return;
        }
      }
    }

    // fetch window of recent messages
    // Collect messages across multiple fetch pages until we have `targetCount` or run out.
    // This is more robust than a single 100-message fetch.
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const collected: Message[] = [];
    let lastId: string | undefined = undefined;
    let fetchedAny = false;

    try {
      // Loop and fetch pages of up to 100 messages until we gather enough candidates
      while (collected.length < targetCount) {
        const fetchOptions: any = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const page = await channel.messages.fetch(fetchOptions);
        if (!page || page.size === 0) break;
        fetchedAny = true;

        // Page is ordered newest->oldest. Iterate in page order and collect matching messages.
        for (const m of page.values()) {
          if (m.id === message.id) continue; // don't delete the command message
          if (m.system) continue;
          if (now - m.createdTimestamp > fourteenDays) continue;
          if (targetMemberId && m.author.id !== targetMemberId) continue;
          collected.push(m);
          if (collected.length >= targetCount) break;
        }

        // Prepare for next page
        lastId = page.last()?.id;
        // If the page returned fewer than 100 messages, there are no more to fetch.
        if (page.size < 100) break;
      }
    } catch (err: any) {
      console.error(
        "runPurge: failed while fetching pages:",
        (err as any)?.message ?? err,
      );
      const embed = new EmbedBuilder()
        .setTitle("Fetch failed")
        .setDescription("Failed to fetch recent messages for deletion.")
        .addFields({
          name: "Error",
          value: (err as any)?.message ?? String(err),
        })
        .setColor(0xff5555)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }

    if (collected.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("Nothing to delete")
        .setDescription(
          targetMemberId
            ? "No recent messages from that user found to delete."
            : fetchedAny
              ? "No recent messages found to delete."
              : "No messages found.",
        )
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }

    // Delete collected messages in chunks of up to 100 IDs (bulkDelete limit)
    try {
      let totalDeleted = 0;
      for (let i = 0; i < collected.length; i += 100) {
        const batch = collected.slice(i, i + 100);
        const ids = batch.map((m) => m.id);
        // bulkDelete with `true` will filter out messages older than 14 days,
        // but we've already filtered those, so it should delete all within range.
        const res = await channel.bulkDelete(ids, true);
        const deletedCount = (res as any)?.size ?? ids.length;
        totalDeleted += deletedCount;
        // slight delay between batches could be added if desired
      }

      const embed = new EmbedBuilder()
        .setTitle("Messages deleted")
        .setDescription(
          `Deleted **${totalDeleted}** message(s)${
            targetMemberId ? ` from <@${targetMemberId}>` : ""
          } in this channel.`,
        )
        .addFields(
          {
            name: "Requested by",
            value: `${message.author.tag}`,
            inline: true,
          },
          { name: "Requested count", value: `${targetCount}`, inline: true },
        )
        .setColor(0x33cc33)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    } catch (err: any) {
      console.error(
        "runPurge: bulkDelete failed during deletion:",
        (err as any)?.message ?? err,
      );
      // Fall back to deleting individually
      let deleted = 0;
      for (const msg of collected) {
        try {
          await msg.delete();
          deleted++;
        } catch {
          // ignore individual failures
        }
      }
      const embed = new EmbedBuilder()
        .setTitle("Purge partial")
        .setDescription(
          `Deleted ${deleted} message(s) (fallback individual deletes).`,
        )
        .setColor(0xffcc00)
        .setTimestamp();
      await sendEmbedToChannelOrDM(channel, message.author, embed);
      return;
    }
  } catch (err: any) {
    console.error("runPurge: unexpected error:", (err as any)?.message ?? err);
    const embed = new EmbedBuilder()
      .setTitle("Error")
      .setDescription(
        "An unexpected error occurred while processing the purge command.",
      )
      .addFields({ name: "Error", value: (err as any)?.message ?? String(err) })
      .setColor(0xff5555)
      .setTimestamp();
    try {
      await sendEmbedToChannelOrDM(message.channel, message.author, embed);
    } catch {
      // ignore
    }
  }
}
