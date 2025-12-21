import { Message, PermissionFlagsBits, EmbedBuilder, Colors } from "discord.js";
import { PrefixCommand } from "../types";

const removeroleCommand: PrefixCommand = {
  name: "removerole",
  description: "Removes a role from a user.",
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
            `❌ You need to mention a user to remove a role from.

**Usage:** \`${process.env.PREFIX || "S"}removerole @user <role>\`
**Example:** \`${process.env.PREFIX || "S"}removerole @user Member\`

• Mention the user directly
• Or provide their user ID
• They must be in this server`,
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
            `❌ That user is not in this server.

• Make sure they haven't left the server
• Try mentioning them again
• Ensure you're using the correct user ID`,
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
            `❌ You need to specify a role to remove.

**Usage:** \`${process.env.PREFIX || "S"}removerole @user <role>\`
**Example:** \`${process.env.PREFIX || "S"}removerole @user Member\`

You can specify the role by:
• Mentioning it: \`@role\`
• Using its name: \`Member\`
• Using its ID: \`123456789012345678\``,
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

**Please check:**
• The role name is spelled correctly
• The role exists in this server
• You have permission to manage this role
• I have permission to manage this role

**You can specify the role by:**
• Mentioning it: \`@role\`
• Using its exact name: \`Member\`
• Using its ID: \`123456789012345678\``,
          ),
        ],
      });
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Not Assigned",
            `❌ ${targetUser.tag} does not have the **${role.name}** role.

• They might have already lost the role
• Check if they have any similar roles
• Verify you're removing the correct role`,
          ),
        ],
      });
      return;
    }

    try {
      await member.roles.remove(role);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Role Removed")
        .setColor(Colors.Green)
        .setDescription(
          `Successfully removed the **${role.name}** role from ${targetUser.tag}.`,
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
        .setFooter({
          text: `Action performed by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL(),
        });

      await message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error(
        `Failed to remove role from user ${targetUser.tag}:`,
        error,
      );
      await message.reply({
        embeds: [
          createErrorEmbed(
            "Role Removal Failed",
            `❌ There was an error trying to remove that role.

**Possible causes:**
• My role is lower than the target role
• The role is managed by an integration (bot, etc.)
• I don't have the **Manage Roles** permission
• The role is a default role or @everyone
• Discord API is experiencing issues

**Solutions:**
• Move my role above the target role
• Check role hierarchy
• Ensure proper permissions`,
          ),
        ],
      });
    }
  },
};

export default removeroleCommand;
