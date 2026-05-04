using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Features
{
    public class AutoroleFeature
    {
        private readonly DiscordSocketClient _client;
        private readonly string _welcomeRoleId;

        public AutoroleFeature(DiscordSocketClient client, IConfiguration config)
        {
            _client = client;
            _welcomeRoleId = config["WELCOME_ROLE_ID"] ?? "1427396865711673484";
            _client.UserJoined += OnUserJoinedAsync;
        }

        private async Task OnUserJoinedAsync(SocketGuildUser user)
        {
            if (!ulong.TryParse(_welcomeRoleId, out ulong roleId))
                return;

            var role = user.Guild.GetRole(roleId);
            if (role == null)
                return;

            try
            {
                await user.AddRoleAsync(role);
            }
            catch
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
