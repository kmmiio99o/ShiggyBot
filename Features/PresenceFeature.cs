using System.Globalization;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Features
{
    internal sealed class PresenceFeature : IDisposable
    {
        private readonly DiscordSocketClient _client;
        private readonly string _status;
        private readonly int _interval;
        private Timer? _timer;
        private int _index;

        private readonly ActivityType[] _activities =
        [
            ActivityType.Playing,
            ActivityType.Listening,
            ActivityType.Watching
        ];

        public PresenceFeature(DiscordSocketClient client, IConfiguration config)
        {
            _client = client;
            _status = config["PRESENCE_STATUS"] ?? "Online";
            _interval = int.Parse(config["PRESENCE_INTERVAL"] ?? "300", CultureInfo.InvariantCulture) * 1000;

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
                Game activity = new("ShiggyCord", _activities[_index % _activities.Length]);
                UserStatus status = Enum.Parse<UserStatus>(_status, true);
                await _client.SetActivityAsync(activity).ConfigureAwait(false);
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
