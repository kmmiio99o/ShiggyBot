using Discord.WebSocket;
using ShiggyBot.Data;

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
        }

        private async Task OnUserJoinedAsync(SocketGuildUser user)
        {
            ulong? roleId = await _db.GetWelcomeRoleAsync(user.Guild.Id).ConfigureAwait(false);
            if (roleId is null or 0)
            {
                return;
            }

            try
            {
                await user.AddRoleAsync(roleId.Value).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                // Silently ignore if bot lacks permissions
            }
        }

        public void Unregister()
        {
            _client.UserJoined -= OnUserJoinedAsync;
        }
    }
}
