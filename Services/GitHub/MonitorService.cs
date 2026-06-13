using System.Globalization;
using System.Text.Json;
using Discord;
using Discord.WebSocket;
using Microsoft.Extensions.Configuration;
using ShiggyBot.Utils;

namespace ShiggyBot.Services.GitHub
{
    internal sealed class MonitorService : IDisposable
    {
        private const int PollMinutes = 5;

        private readonly DiscordSocketClient _client;
        private readonly HttpClient _http;
        private readonly string _owner = string.Empty;
        private readonly string _repo = string.Empty;
        private readonly ulong _channelId;

        private readonly CommitHandler _commits;
        private readonly PullRequestHandler _prs;
        private readonly StarHandler _stars;

        private Timer? _timer;

        public MonitorService(DiscordSocketClient client, IConfiguration config)
        {
            ArgumentNullException.ThrowIfNull(client);
            ArgumentNullException.ThrowIfNull(config);

            _client = client;

            string? token = config["GITHUB_TOKEN"];
            _http = new HttpClient();
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("ShiggyBot/1.0");
            _http.Timeout = TimeSpan.FromSeconds(15);
            if (!string.IsNullOrEmpty(token))
            {
                _http.DefaultRequestHeaders.Authorization = new("Bearer", token);
            }

            string? repo = config["GITHUB_REPO"];
            if (!string.IsNullOrEmpty(repo) && repo.Contains('/', StringComparison.Ordinal))
            {
                string[] parts = repo.Split('/', 2);
                _owner = parts[0];
                _repo = parts[1];
            }

            string? chId = config["GITHUB_WEBHOOK_CHANNEL_ID"];
            _channelId = !string.IsNullOrEmpty(chId) && ulong.TryParse(chId, NumberStyles.Integer, CultureInfo.InvariantCulture, out ulong id) ? id : 0;

            _commits = new();
            _prs = new();
            _stars = new();
        }

        public bool Enabled => _channelId != 0;

        public void Start()
        {
            if (!Enabled)
            {
                Logger.Warn("[GITHUB] GITHUB_WEBHOOK_CHANNEL_ID not set — monitor not started");
                return;
            }

            Logger.Info($"[GITHUB] Monitoring {_owner}/{_repo} every {PollMinutes}min");
            _timer = new Timer(async _ => await PollAsync().ConfigureAwait(false), null, TimeSpan.Zero, TimeSpan.FromMinutes(PollMinutes));
        }

        private async Task PollAsync()
        {
            List<Embed> embeds = [];

            try
            {
                embeds.AddRange(await _commits.PollAsync(_http, _owner, _repo).ConfigureAwait(false));
                embeds.AddRange(await _prs.PollAsync(_http, _owner, _repo).ConfigureAwait(false));

                Embed? starEmbed = await _stars.PollAsync(_http, _owner, _repo).ConfigureAwait(false);
                if (starEmbed is not null)
                {
                    embeds.Add(starEmbed);
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                Logger.Error($"[GITHUB] Poll failed: {ex.Message}", ex);
                return;
            }

            foreach (Embed embed in embeds)
            {
                await SendEmbedAsync(embed).ConfigureAwait(false);
            }
        }

        private async Task SendEmbedAsync(Embed embed)
        {
            try
            {
                ITextChannel? channel = await _client.GetChannelAsync(_channelId).ConfigureAwait(false) as ITextChannel;
                if (channel is not null)
                {
                    await channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
                }
            }
            catch (HttpRequestException ex)
            {
                Logger.Error("[GITHUB] Failed to send embed", ex);
            }
            catch (InvalidOperationException ex)
            {
                Logger.Error("[GITHUB] Channel not available", ex);
            }
            catch (TaskCanceledException ex)
            {
                Logger.Error("[GITHUB] Send timed out", ex);
            }
        }

        public void Dispose()
        {
            _timer?.Dispose();
            _http?.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
