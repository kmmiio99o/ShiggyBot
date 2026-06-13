using System.Globalization;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;
using ShiggyBot.Services;

namespace ShiggyBot.Discord
{
    internal sealed class PresenceFeature : IDisposable
    {
        private readonly DiscordSocketClient _client;
        private readonly string _status;
        private readonly int _interval;
        private readonly GitHubStatsService _gitHub;
        private Timer? _timer;
        private int _index;

        private static readonly (string Text, ActivityType Type)[] Templates =
        [
            ("⭐ {0} stars",                        ActivityType.Watching),
            ("Forks: {1}",                           ActivityType.Playing),
            ("{2} open issues",                     ActivityType.Watching),
            ("⭐{0} | Forks: {1}",                  ActivityType.Playing),
        ];

        public PresenceFeature(DiscordSocketClient client, IConfiguration config, GitHubStatsService gitHub)
        {
            _client = client;
            _status = config["PRESENCE_STATUS"] ?? "Online";
            _interval = int.Parse(config["PRESENCE_INTERVAL"] ?? "300", CultureInfo.InvariantCulture) * 1000;
            _gitHub = gitHub;

            _client.Ready += OnReadyAsync;
        }

        private Task OnReadyAsync()
        {
            _timer = new Timer(UpdatePresence, null, 0, _interval);
            return Task.CompletedTask;
        }

        private async void UpdatePresence(object? state)
        {
            try
            {
                RepoStats s = _gitHub.Stats;
                (string text, ActivityType type) = Templates[_index % Templates.Length];
                string message = string.Format(CultureInfo.InvariantCulture, text, s.Stars, s.Forks, s.OpenIssues);

                UserStatus status = Enum.Parse<UserStatus>(_status, true);
                await _client.SetActivityAsync(new Game(message, type)).ConfigureAwait(false);
                await _client.SetStatusAsync(status).ConfigureAwait(false);
                _index++;
            }
            catch (HttpRequestException)
            {
                // Ignore presence update errors
            }
            catch (TaskCanceledException)
            {
                // Ignore presence update timeout errors
            }
        }

        public void Dispose()
        {
            _timer?.Dispose();
            _client.Ready -= OnReadyAsync;
            GC.SuppressFinalize(this);
        }
    }
}
