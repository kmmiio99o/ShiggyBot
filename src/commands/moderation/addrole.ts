import { Message, PermissionFlagsBits, EmbedBuilder, Colors } from "discord.js";
import { PrefixCommand } from "../types";

const addroleCommand: PrefixCommand = {
  name: "addrole",
  description: "Adds a role to a user.",
  usage: "<user> <role>",
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(message: Message, args: string[]) {
    const createErrorEmbed = (title: string, description: string) => {
      return new EmbedBuilder()
        .setTitle(title)
        .setColor(Colors.Red)
        .setDescription(description)
        .setTimestamp();
    };

    if (!message.guild) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Command Error",
            "❌ This command can only be used in a server.",
          ),
        ],
      });
      return;
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "User Required",
            `❌ You need to mention a user to add a role to.

**Usage:** \`${process.env.PREFIX || "S"}addrole @user <role>\`
**Example:** \`${process.env.PREFIX || "S"}addrole @user Member\``,
          ),
        ],
      });
      return;
    }

    const member = message.guild.members.cache.get(targetUser.id);
    if (!member) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "User Not Found",
            "❌ That user is not in this server.",
          ),
        ],
      });
      return;
    }

    // Role can be mentioned or by name/ID
    const roleIdentifier = args.slice(1).join(" ").trim();
    if (!roleIdentifier) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Required",
            `❌ You need to specify a role to add.

**Usage:** \`${process.env.PREFIX || "S"}addrole @user <role>\`
**Example:** \`${process.env.PREFIX || "S"}addrole @user Member\``,
          ),
        ],
      });
      return;
    }

    const role = message.guild.roles.cache.find(
      (r) =>
        r.name === roleIdentifier ||
        r.id === roleIdentifier.replace(/[<@&>]/g, ""),
    );

    if (!role) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Not Found",
            `❌ Could not find role "${roleIdentifier}".

• Check the role name is spelled correctly
• You can use role mentions or role IDs
• Ensure the role exists in this server`,
          ),
        ],
      });
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Already Assigned",
            `❌ ${targetUser.tag} already has the **${role.name}** role.`,
          ),
        ],
      });
      return;
    }

    try {
      await member.roles.add(role);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Role Added")
        .setColor(Colors.Green)
        .setDescription(
          `Successfully added the **${role.name}** role to ${targetUser.tag}.`,
        )
        .addFields(
          { name: "👤 User", value: targetUser.tag, inline: true },
          { name: "🆔 User ID", value: targetUser.id, inline: true },
          { name: "🎭 Role", value: role.name, inline: true },
          { name: "🎨 Role Color", value: role.hexColor, inline: true },
          { name: "🛡️ Moderator", value: message.author.tag, inline: true },
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Action performed by ${message.author.tag}` });

      await message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error(`Failed to add role to user ${targetUser.tag}:`, error);
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Assignment Failed",
            "❌ There was an error trying to add that role. Make sure:\n• I have the Manage Roles permission\n• My role is higher than the target role\n• The role is not managed by an integration",
          ),
        ],
      });
    }
  },
};

export default addroleCommand;
