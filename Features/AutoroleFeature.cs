using Discord;
using Discord.WebSocket;
using ShiggyBot.Data;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    internal sealed class AutoroleFeature
    {
        private readonly DiscordSocketClient _client;
        private readonly DatabaseService _db;

        public AutoroleFeature(DiscordSocketClient client, DatabaseService db)
        {
            _client = client;
            _db = db;
            _client.UserJoined += OnUserJoinedAsync;
            _client.GuildAvailable += OnGuildAvailableAsync;
        }

        public void Unregister()
        {
            _client.UserJoined -= OnUserJoinedAsync;
            _client.GuildAvailable -= OnGuildAvailableAsync;
        }

        private async Task OnUserJoinedAsync(SocketGuildUser user)
        {
            ulong? roleId = await _db.GetWelcomeRoleAsync(user.Guild.Id).ConfigureAwait(false);
            if (roleId is null or 0)
            {
                return;
            }

            await AssignRoleAsync(user, roleId.Value).ConfigureAwait(false);
        }

        private async Task OnGuildAvailableAsync(SocketGuild guild)
        {
            ulong? roleId = await _db.GetWelcomeRoleAsync(guild.Id).ConfigureAwait(false);
            if (roleId is null or 0)
            {
                return;
            }

            IRole? role = await guild.GetRoleAsync(roleId.Value).ConfigureAwait(false);
            if (role is null)
            {
                return;
            }

            foreach (SocketGuildUser user in guild.Users)
            {
                if (user.Roles.Contains(role))
                {
                    continue;
                }

                await AssignRoleAsync(user, roleId.Value).ConfigureAwait(false);
            }
        }

        private static async Task AssignRoleAsync(SocketGuildUser user, ulong roleId)
        {
            try
            {
                await user.AddRoleAsync(roleId).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is HttpRequestException or ArgumentException or InvalidOperationException)
            {
                Logger.Warn($"Failed to assign welcome role to {user.Id} in guild {user.Guild.Id}: {ex.Message}");
            }
        }
    }
}
