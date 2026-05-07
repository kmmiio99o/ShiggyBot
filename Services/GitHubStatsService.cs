using System.Text.Json;

namespace ShiggyBot.Services
{
    internal sealed class GitHubStatsService : IDisposable
    {
        private readonly HttpClient _http;
        private readonly Timer _timer;
        private volatile RepoStats _stats = new();
        private readonly string _owner;
        private readonly string _repo;

        public GitHubStatsService(string owner = "kmmiio99o", string repo = "ShiggyCord", int refreshMinutes = 10)
        {
            _owner = owner;
            _repo = repo;
            _http = new HttpClient();
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("ShiggyBot/1.0");
            _stats = FetchStatsAsync().GetAwaiter().GetResult();
            _timer = new Timer(async _ => await FetchStatsAsync().ConfigureAwait(false), null, TimeSpan.FromMinutes(refreshMinutes), TimeSpan.FromMinutes(refreshMinutes));
        }

        public RepoStats Stats => _stats;

        private async Task<RepoStats> FetchStatsAsync()
        {
            try
            {
                Uri uri = new($"https://api.github.com/repos/{_owner}/{_repo}");
                HttpResponseMessage response = await _http.GetAsync(uri).ConfigureAwait(false);
                response.EnsureSuccessStatusCode();
                string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                using JsonDocument doc = JsonDocument.Parse(json);
                JsonElement root = doc.RootElement;

                RepoStats updated = new()
                {
                    Stars = root.GetProperty("stargazers_count").GetInt32(),
                    Forks = root.GetProperty("forks_count").GetInt32(),
                    OpenIssues = root.GetProperty("open_issues_count").GetInt32(),
                    Description = root.TryGetProperty("description", out JsonElement desc) ? desc.GetString() ?? "" : ""
                };
                _stats = updated;
                return updated;
            }
            catch (HttpRequestException)
            {
            }
            catch (TaskCanceledException)
            {
            }
            return _stats;
        }

        public void Dispose()
        {
            _timer?.Dispose();
            _http?.Dispose();
            GC.SuppressFinalize(this);
        }
    }

    internal sealed class RepoStats
    {
        public int Stars { get; set; }
        public int Forks { get; set; }
        public int OpenIssues { get; set; }
        public string Description { get; set; } = "";
    }
}
