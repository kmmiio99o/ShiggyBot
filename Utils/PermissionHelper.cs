using Discord;
using Discord.WebSocket;

namespace ShiggyBot.Utils
{
    internal static class PermissionHelper
    {
        public static bool HasPermission(SocketUserMessage message, GuildPermission required)
        {
            return message.Author is SocketGuildUser guildUser &&
                (guildUser.GuildPermissions.Has(required) || guildUser.GuildPermissions.Administrator);
        }

        public static string GetPermissionName(GuildPermission permission)
        {
            return permission.ToString();
        }

        public static async Task<bool> RequirePermissionAsync(SocketUserMessage message, GuildPermission required)
        {
            if (message.Channel is not SocketGuildChannel)
            {
                await message.Channel.SendMessageAsync(
                    embed: EmbedHelper.BuildErrorEmbed("This command can only be used in a server.")
                ).ConfigureAwait(false);
                return false;
            }

            if (!HasPermission(message, required))
            {
                string permName = GetPermissionName(required);
                await message.Channel.SendMessageAsync(
                    embed: EmbedHelper.BuildErrorEmbed($"You need {permName} permission to use this command.")
                ).ConfigureAwait(false);
                return false;
            }

            return true;
        }
    }
}
