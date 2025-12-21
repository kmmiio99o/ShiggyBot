import { Message, PermissionFlagsBits } from "discord.js";
import { PrefixCommand } from "../types";

const addroleCommand: PrefixCommand = {
  name: "addrole",
  description: "Adds a role to a user.",
  usage: "<user> <role>",
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(message: Message, args: string[]) {
    if (!message.guild) {
      await message.reply("This command can only be used in a server.");
      return;
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      await message.reply("You need to mention a user to add a role to.");
      return;
    }

    const member = message.guild.members.cache.get(targetUser.id);
    if (!member) {
      await message.reply("That user is not in this server.");
      return;
    }

    // Role can be mentioned or by name/ID
    const roleIdentifier = args.slice(1).join(" ").trim();
    if (!roleIdentifier) {
      await message.reply("You need to specify a role to add.");
      return;
    }

    const role = message.guild.roles.cache.find(
      (r) =>
        r.name === roleIdentifier ||
        r.id === roleIdentifier.replace(/[<@&>]/g, ""),
    );

    if (!role) {
      await message.reply(`Could not find role "${roleIdentifier}".`);
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await message.reply(
        `${targetUser.tag} already has the ${role.name} role.`,
      );
      return;
    }

    try {
      await member.roles.add(role);
      await message.reply(
        `Successfully added the ${role.name} role to ${targetUser.tag}.`,
      );
    } catch (error) {
      console.error(`Failed to add role to user ${targetUser.tag}:`, error);
      await message.reply("There was an error trying to add that role.");
    }
  },
};

export default addroleCommand;
