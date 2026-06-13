using System.Text.Json;
using Discord;

namespace ShiggyBot.Services.GitHub
{
    internal sealed class CommitHandler
    {
        private const int MaxItems = 3;

        private readonly HashSet<string> _known = new(StringComparer.Ordinal);
        private bool _initialized;

        public async Task<IReadOnlyList<Embed>> PollAsync(HttpClient http, string owner, string repo)
        {
            Uri uri = new($"https://api.github.com/repos/{owner}/{repo}/commits?per_page={MaxItems}");
            using HttpResponseMessage response = await http.GetAsync(uri).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return [];
            }

            string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement.ArrayEnumerator commits = doc.RootElement.EnumerateArray();

            List<(string Sha, string Author, string Message, string Url)> newCommits = [];

            foreach (JsonElement c in commits)
            {
                string sha = c.GetProperty("sha").GetString() ?? "";
                if (string.IsNullOrEmpty(sha))
                {
                    continue;
                }

                if (_initialized && !_known.Contains(sha))
                {
                    string author = c.GetProperty("commit").GetProperty("author").GetProperty("name").GetString() ?? "Unknown";
                    string msg = c.GetProperty("commit").GetProperty("message").GetString() ?? "No message";
                    string url = c.GetProperty("html_url").GetString() ?? "";
                    newCommits.Add((sha, author, msg, url));
                }

                _known.Add(sha);
            }

            _initialized = true;

            if (newCommits.Count == 0)
            {
                return [];
            }

            EmbedBuilder embed = new()
            {
                Title = $"🔨 {newCommits.Count} new commit(s) to {owner}/{repo}",
                Url = $"https://github.com/{owner}/{repo}",
                Color = new Color(0x5865F2),
                Timestamp = DateTimeOffset.UtcNow
            };

            foreach ((string sha, string author, string msg, _) in newCommits)
            {
                string firstLine = msg.Split('\n')[0];
                firstLine = firstLine.Length > 80 ? firstLine[..80] + "…" : firstLine;
                embed.AddField($"`{sha[..7]}` — {author}", firstLine, inline: false);
            }

            return [embed.Build()];
        }
    }
}
