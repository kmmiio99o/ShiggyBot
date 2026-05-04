using System;
using System.Threading;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Features
{
    public class PresenceFeature : IDisposable
    {
        private readonly DiscordSocketClient _client;
        private readonly string _status;
        private readonly int _interval;
        private Timer? _timer;
        private int _index;

        private readonly ActivityType[] _activities = new[]
        {
            ActivityType.Playing,
            ActivityType.Listening,
            ActivityType.Watching
        };

        public PresenceFeature(DiscordSocketClient client, IConfiguration config)
        {
            _client = client;
            _status = config["PRESENCE_STATUS"] ?? "Online";
            _interval = int.Parse(config["PRESENCE_INTERVAL"] ?? "300") * 1000;

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
                var activity = new Game("ShiggyCord", _activities[_index % _activities.Length]);
                var status = Enum.Parse<UserStatus>(_status, true);
                await _client.SetActivityAsync(activity);
                await _client.SetStatusAsync(status);
                _index++;
            }
            catch
            {
                // Ignore presence update errors
            }
        }

        public void Dispose()
        {
            _timer?.Dispose();
            _client.Ready -= OnReadyAsync;
        }
    }
}
