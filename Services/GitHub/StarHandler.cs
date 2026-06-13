using System.Text.Json;
using Discord;

namespace ShiggyBot.Services.GitHub
{
    internal sealed class StarHandler
    {
        private int _lastCount;
        private bool _initialized;

        public async Task<Embed?> PollAsync(HttpClient http, string owner, string repo)
        {
            Uri uri = new($"https://api.github.com/repos/{owner}/{repo}");
            using HttpResponseMessage response = await http.GetAsync(uri).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;
            int stars = root.GetProperty("stargazers_count").GetInt32();

            if (!_initialized)
            {
                _lastCount = stars;
                _initialized = true;
                return null;
            }

            if (stars <= _lastCount)
            {
                return null;
            }

            int gained = stars - _lastCount;
            _lastCount = stars;

            EmbedBuilder embed = new()
            {
                Title = $"⭐ {owner}/{repo} gained {gained} new star{(gained == 1 ? "" : "s")}!",
                Url = root.GetProperty("html_url").GetString() ?? "",
                Description = $"**Total: {stars}** star{(stars == 1 ? "" : "s")}",
                Color = new Color(0xF1C40F),
                Timestamp = DateTimeOffset.UtcNow
            };

            return embed.Build();
        }
    }
}
