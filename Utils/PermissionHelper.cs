using System.Globalization;
using System.Text;
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

        public static async Task<IGuildUser?> ResolveRepliedUserAsync(SocketGuild guild, SocketUserMessage message)
        {
            if (message.ReferencedMessage is null)
            {
                return null;
            }

            ulong targetId = message.ReferencedMessage.Author.Id;
            SocketGuildUser? cached = guild.GetUser(targetId);
            if (cached is not null)
            {
                return cached;
            }

            try
            {
                return await ((IGuild)guild).GetUserAsync(targetId).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                return null;
            }
        }

        public static SocketRole? ResolveRole(SocketGuild guild, string roleArg)
        {
            SocketRole? exact = guild.Roles.FirstOrDefault(r =>
                r.Name.Equals(roleArg, StringComparison.OrdinalIgnoreCase) ||
                r.Id.ToString(CultureInfo.InvariantCulture) == roleArg ||
                r.Mention == roleArg);

            if (exact is not null)
            {
                return exact;
            }

            string cleanedSearch = CleanRoleName(roleArg);

            SocketRole? cleaned = guild.Roles.FirstOrDefault(r =>
            {
                try
                {
                    string cleaned = CleanRoleName(r.Name);
                    return cleaned.Equals(cleanedSearch, StringComparison.OrdinalIgnoreCase) && cleaned.Length > 0;
                }
                catch (ArgumentException)
                {
                    return false;
                }
            });

            if (cleaned is not null)
            {
                return cleaned;
            }

            SocketRole[] contains = [.. guild.Roles
                .Where(r => r.Name.Contains(roleArg, StringComparison.OrdinalIgnoreCase))];

            return contains.Length switch
            {
                1 => contains[0],
                > 1 => contains.MinBy(r => r.Name.Length),
                _ => null
            };
        }

        private static string CleanRoleName(string name)
        {
            return new string([.. name
                .Normalize(NormalizationForm.FormKC)
                .Where(char.IsLetterOrDigit)]);
        }

        public static async Task<IGuildUser?> ResolveUserAsync(SocketGuild guild, string userArg)
        {
            ulong? mentionId = EmbedHelper.ParseUserMention(userArg);
            if (mentionId.HasValue)
            {
                SocketGuildUser? cached = guild.GetUser(mentionId.Value);
                if (cached is not null)
                {
                    return cached;
                }

                try
                {
                    return await ((IGuild)guild).GetUserAsync(mentionId.Value).ConfigureAwait(false);
                }
                catch (HttpRequestException)
                {
                    return null;
                }
            }

            IGuildUser? cachedUser = guild.Users.FirstOrDefault(u =>
                u.Username == userArg ||
                u.GlobalName == userArg ||
                u.Nickname == userArg ||
                u.Id.ToString(CultureInfo.InvariantCulture) == userArg);

            if (cachedUser is not null)
            {
                return cachedUser;
            }

            if (ulong.TryParse(userArg, NumberStyles.Integer, CultureInfo.InvariantCulture, out ulong parsedId))
            {
                try
                {
                    return await ((IGuild)guild).GetUserAsync(parsedId).ConfigureAwait(false);
                }
                catch (HttpRequestException)
                {
                    return null;
                }
            }

            try
            {
                IReadOnlyCollection<IGuildUser> results = await ((IGuild)guild).SearchUsersAsync(userArg, limit: 10).ConfigureAwait(false);
                return results.FirstOrDefault(u =>
                    u.Username == userArg ||
                    u.GlobalName == userArg ||
                    u.Nickname == userArg);
            }
            catch (HttpRequestException)
            {
                return null;
            }
        }
    }
}
