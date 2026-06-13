using System.Text.Json;
using Discord;

namespace ShiggyBot.Services.GitHub
{
    internal sealed class PullRequestHandler
    {
        private const int MaxItems = 3;

        private readonly HashSet<int> _known = [];
        private bool _initialized;

        public async Task<IReadOnlyList<Embed>> PollAsync(HttpClient http, string owner, string repo)
        {
            Uri uri = new($"https://api.github.com/repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc&per_page={MaxItems}");
            using HttpResponseMessage response = await http.GetAsync(uri).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return [];
            }

            string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement.ArrayEnumerator prs = doc.RootElement.EnumerateArray();

            List<Embed> embeds = [];

            foreach (JsonElement pr in prs)
            {
                int number = pr.GetProperty("number").GetInt32();

                if (!_initialized)
                {
                    _known.Add(number);
                    continue;
                }

                if (_known.Contains(number))
                {
                    continue;
                }

                _known.Add(number);

                string title = pr.GetProperty("title").GetString() ?? "No title";
                string state = pr.GetProperty("state").GetString() ?? "unknown";
                string user = pr.GetProperty("user").GetProperty("login").GetString() ?? "unknown";
                string prUrl = pr.GetProperty("html_url").GetString() ?? "";
                string body = pr.GetProperty("body").GetString() ?? "";
                bool merged = pr.TryGetProperty("merged", out JsonElement m) && m.GetBoolean();

                string stateLabel = merged ? "merged" : state;

                string emoji;
                Color color;
                switch (state)
                {
                    case "open":
                        emoji = "📋";
                        color = new Color(0x2EA043);
                        break;
                    case "closed" when merged:
                        emoji = "🔀";
                        color = new Color(0x6E46F0);
                        break;
                    case "closed":
                        emoji = "❌";
                        color = new Color(0xDA3633);
                        break;
                    default:
                        emoji = "📋";
                        color = new Color(0x5865F2);
                        break;
                }

                EmbedBuilder embed = new()
                {
                    Title = $"{emoji} [{owner}/{repo}] PR #{number}: {title}",
                    Url = prUrl,
                    Color = color,
                    Description = string.IsNullOrEmpty(body)
                        ? null
                        : (body.Length > 300 ? body[..300] + "…" : body),
                    Timestamp = DateTimeOffset.UtcNow
                };

                embed.AddField("Author", user, inline: true);
                embed.AddField("State", char.ToUpperInvariant(stateLabel[0]) + stateLabel[1..], inline: true);

                embeds.Add(embed.Build());
            }

            _initialized = true;
            return embeds;
        }
    }
}
