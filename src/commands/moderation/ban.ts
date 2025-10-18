import { Message, PermissionsBitField, EmbedBuilder } from "discord.js";

/**
 * Ban command handler (prefix-based modular command).
 *
 * Usage:
 *   Sban <user> [reason...]
 *
 * - Accepts a user mention (<@123...>) or a raw user ID.
 * - Checks that the command invoker has BanMembers permission.
 * - Checks that the bot has BanMembers permission and that the target is bannable.
 *
 * Export:
 *   default async function runBan(message, args)
 *
 * Examples (used when a user invokes the command without arguments):
 * - Sban @offender Spamming
 * - Sban 123456789012345678 Rule violation
 */
const EXAMPLES = [
  "Sban @offender Spamming",
  "Sban 123456789012345678 Rule violation",
];
export default async function runBan(
  message: Message,
  args: string[]
): Promise<void> {
  const reply = async (txt: string) => {
    try {
      await message.reply({ content: txt });
    } catch {
      // ignore reply errors
    }
  };

  try {
    if (!message.guild) {
      const embed = new EmbedBuilder()
        .setTitle("Command unavailable")
        .setDescription("This command can only be used in a server.")
        .setColor(0xffcc00)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        // ignore reply errors
      }
      return;
    }

    const authorMember = message.member;
    const botMember = message.guild.members.me;

    // Permission checks
    if (!authorMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      const embed = new EmbedBuilder()
        .setTitle("Missing permission")
        .setDescription("You do not have permission to ban members.")
        .setColor(0xff5555)
        .setTimestamp()
        .addFields({
          name: "Required",
          value: "Ban Members",
          inline: true,
        });
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        // ignore reply errors
      }
      return;
    }
    if (!botMember?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      const embed = new EmbedBuilder()
        .setTitle("I lack permission")
        .setDescription(
          "I do not have permission to ban members. Please grant me the Ban Members permission."
        )
        .setColor(0xff5555)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        // ignore reply errors
      }
      return;
    }

    const targetToken = args[0];
    if (!targetToken) {
      // Provide usage plus inline examples stored in this command file — send as an embed
      const embed = new EmbedBuilder()
        .setTitle("Sban — Usage & Examples")
        .setDescription(
          "Ban a member from the server. Provide a mention or a user ID."
        )
        .addFields(
          { name: "Usage", value: "`Sban <user> [reason...]`", inline: false },
          {
            name: "Examples",
            value: EXAMPLES.map((e) => `\`${e}\``).join("\n"),
            inline: false,
          }
        )
        .setColor(0xff5555)
        .setTimestamp();

      try {
        await (message.channel as any).send({ embeds: [embed] });
      } catch (err) {
        // If sending an embed fails for any reason, fall back to the plain-text reply
        await reply(
          `Usage: Sban <user> [reason...]\nExamples:\n - ${EXAMPLES.join(
            "\n - "
          )}`
        );
      }
      return;
    }

    // Resolve ID from mention or raw ID
    const mentionMatch = targetToken.match(/^<@!?(?<id>\d+)>$/);
    const id = mentionMatch?.groups?.id ?? targetToken.replace(/[<@!>]/g, "");

    if (!/^\d+$/.test(id)) {
      const embed = new EmbedBuilder()
        .setTitle("Invalid target")
        .setDescription("Please provide a valid user mention or user ID.")
        .setColor(0xffcc00)
        .setTimestamp()
        .addFields({
          name: "Example",
          value: "`Sban @offender` or `Sban 123456789012345678`",
        });
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        // fallback
        await reply("Please provide a valid user mention or ID.");
      }
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
      const embed = new EmbedBuilder()
        .setTitle("Member not found")
        .setDescription("Could not find that member in this server.")
        .setColor(0xffcc00)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply("Could not find that member in this server.");
      }
      return;
    }

    // Prevent banning self or owner (optional safety)
    if (targetMember.id === message.client.user?.id) {
      const embed = new EmbedBuilder()
        .setTitle("Operation blocked")
        .setDescription("I will not ban myself.")
        .setColor(0xffaa00)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply("I will not ban myself.");
      }
      return;
    }
    if (targetMember.id === authorMember?.id) {
      const embed = new EmbedBuilder()
        .setTitle("Operation blocked")
        .setDescription("You cannot ban yourself.")
        .setColor(0xffaa00)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply("You cannot ban yourself.");
      }
      return;
    }
    if (message.guild.ownerId === targetMember.id) {
      const embed = new EmbedBuilder()
        .setTitle("Operation blocked")
        .setDescription("I cannot ban the server owner.")
        .setColor(0xffaa00)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply("I cannot ban the server owner.");
      }
      return;
    }

    // Check bannable and role hierarchy
    if (!targetMember.bannable) {
      const embed = new EmbedBuilder()
        .setTitle("Cannot ban user")
        .setDescription(
          "I cannot ban that member — likely due to role hierarchy or missing permissions."
        )
        .setColor(0xff5555)
        .setTimestamp()
        .addFields({
          name: "Hint",
          value:
            "Ensure my role is higher than the target and I have the Ban Members permission.",
        });
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply(
          "I cannot ban that member — likely due to role hierarchy or permissions."
        );
      }
      return;
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    // Attempt to ban
    try {
      await targetMember.ban({ reason });
      const embed = new EmbedBuilder()
        .setTitle("Member banned")
        .setDescription(`${targetMember.user.tag} was banned.`)
        .addFields(
          {
            name: "Moderator",
            value: `${authorMember?.user.tag ?? "Unknown"}`,
            inline: true,
          },
          { name: "Reason", value: reason, inline: true }
        )
        .setColor(0xff3333)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply(`Banned ${targetMember.user.tag}. Reason: ${reason}`);
      }
    } catch (err: any) {
      console.error("runBan: failed to ban member:", err);
      const embed = new EmbedBuilder()
        .setTitle("Ban failed")
        .setDescription(`Failed to ban ${targetMember.user.tag}.`)
        .addFields({
          name: "Error",
          value: (err as any)?.message ?? String(err),
        })
        .setColor(0xff5555)
        .setTimestamp();
      try {
        await message.reply({ embeds: [embed] });
      } catch {
        await reply(
          `Failed to ban the member: ${(err as any)?.message ?? String(err)}`
        );
      }
    }
  } catch (err: any) {
    console.error("runBan: unexpected error:", err);
    const embed = new EmbedBuilder()
      .setTitle("Error")
      .setDescription(
        "An unexpected error occurred while processing the ban command."
      )
      .setColor(0xff5555)
      .setTimestamp();
    try {
      await message.reply({ embeds: [embed] });
    } catch {
      // ignore
    }
  }
}
