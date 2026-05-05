using System.Text.Json;

namespace ShiggyBot.Services
{
    internal sealed class PluginService : IDisposable
    {
        private readonly HttpClient _http;
        private const string PluginDataUrl = "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/main/src/plugins-data.json";
        private List<PluginResult>? _cachedPlugins;
        private DateTime _cacheExpiry = DateTime.MinValue;
        private const int CacheMinutes = 60;

        public PluginService()
        {
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("User-Agent", "ShiggyBot");
            _http.Timeout = TimeSpan.FromSeconds(10);
        }

        public async Task<PluginResult?> SearchPluginAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return null;
            }

            try
            {
                List<PluginResult>? plugins = await GetAllPluginsAsync().ConfigureAwait(false);
                if (plugins == null || plugins.Count == 0)
                {
                    return null;
                }

                PluginResult? bestMatch = null;
                int bestDistance = int.MaxValue;
                const int maxDistance = 5;

                foreach (PluginResult plugin in plugins)
                {
                    // Check both name and description for matches
                    int nameDistance = LevenshteinDistance(plugin.Name.ToUpperInvariant(), query.ToUpperInvariant());
                    int descriptionDistance = LevenshteinDistance(plugin.Description.ToUpperInvariant(), query.ToUpperInvariant());

                    int distance = Math.Min(nameDistance, descriptionDistance);

                    if (distance < bestDistance && distance <= maxDistance)
                    {
                        bestDistance = distance;
                        bestMatch = plugin;
                    }

                    // Exact match - return immediately
                    if (plugin.Name.Equals(query, StringComparison.OrdinalIgnoreCase))
                    {
                        return plugin;
                    }
                }

                return bestMatch;
            }
            catch (HttpRequestException ex)
            {
                Utils.Logger.Error($"Error searching plugins: {ex.Message}", ex);
                return null;
            }
            catch (TaskCanceledException ex)
            {
                Utils.Logger.Error($"Plugin search timed out: {ex.Message}", ex);
                return null;
            }
        }

        public async Task<List<PluginResult>> SearchPluginsAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return [];
            }

            try
            {
                List<PluginResult>? plugins = await GetAllPluginsAsync().ConfigureAwait(false);
                if (plugins == null)
                {
                    return [];
                }

                string query_lower = query.ToUpperInvariant();
                List<(PluginResult plugin, int score)> results = [];

                foreach (PluginResult plugin in plugins)
                {
                    int score = 0;

                    // Exact name match
                    if (plugin.Name.Equals(query, StringComparison.OrdinalIgnoreCase))
                    {
                        score += 1000;
                    }

                    // Partial name match
                    if (plugin.Name.ToUpperInvariant().Contains(query_lower, StringComparison.OrdinalIgnoreCase))
                    {
                        score += 500;
                    }

                    // Description contains query
                    if (plugin.Description.ToUpperInvariant().Contains(query_lower, StringComparison.OrdinalIgnoreCase))
                    {
                        score += 100;
                    }

                    if (score > 0)
                    {
                        results.Add((plugin, score));
                    }
                }

                // Sort by score and take top 10 results
                return
                [
                    .. results
                         .OrderByDescending(x => x.score)
                         .Take(10)
                         .Select(x => x.plugin)
                ];
            }
            catch (JsonException ex)
            {
                Utils.Logger.Error($"Error parsing plugin data: {ex.Message}", ex);
                return [];
            }
            catch (HttpRequestException ex)
            {
                Utils.Logger.Error($"Error searching plugins: {ex.Message}", ex);
                return [];
            }
        }

        private async Task<List<PluginResult>?> GetAllPluginsAsync()
        {
            // Return cached plugins if still valid
            if (_cachedPlugins != null && DateTime.UtcNow < _cacheExpiry)
            {
                return _cachedPlugins;
            }

            try
            {
                string json = await _http.GetStringAsync(new Uri(PluginDataUrl)).ConfigureAwait(false);
                _cachedPlugins = ParsePluginsJson(json);
                _cacheExpiry = DateTime.UtcNow.AddMinutes(CacheMinutes);
                return _cachedPlugins;
            }
            catch (JsonException ex)
            {
                Utils.Logger.Error($"Error parsing plugins JSON: {ex.Message}", ex);
                return _cachedPlugins; // Return cached data if available
            }
            catch (HttpRequestException ex)
            {
                Utils.Logger.Error($"Error fetching plugins from {PluginDataUrl}: {ex.Message}", ex);
                return _cachedPlugins; // Return cached data if available
            }
        }

        public void Dispose()
        {
            _http?.Dispose();
            GC.SuppressFinalize(this);
        }

        private static List<PluginResult> ParsePluginsJson(string json)
        {
            List<PluginResult> plugins = [];

            try
            {
                using JsonDocument doc = JsonDocument.Parse(json);
                JsonElement root = doc.RootElement;

                if (root.ValueKind == JsonValueKind.Array)
                {
                    foreach (JsonElement plugin in root.EnumerateArray())
                    {
                        try
                        {
                            List<string> authorsArray = [];
                            if (plugin.TryGetProperty("authors", out JsonElement authorsElement) && authorsElement.ValueKind == JsonValueKind.Array)
                            {
                                foreach (JsonElement author in authorsElement.EnumerateArray())
                                {
                                    if (author.GetString() is string authorName)
                                    {
                                        authorsArray.Add(authorName);
                                    }
                                }
                            }

                            PluginResult result = new()
                            {
                                Name = plugin.TryGetProperty("name", out JsonElement nameElement)
                                    ? nameElement.GetString() ?? "Unknown"
                                    : "Unknown",
                                Description = plugin.TryGetProperty("description", out JsonElement descElement)
                                    ? descElement.GetString() ?? "No description"
                                    : "No description",
                                Status = plugin.TryGetProperty("status", out JsonElement statusElement)
                                    ? statusElement.GetString() ?? "unknown"
                                    : "unknown",
                                SourceUrl = plugin.TryGetProperty("sourceUrl", out JsonElement sourceElement)
                                    ? sourceElement.GetString() ?? ""
                                    : "",
                                InstallUrl = plugin.TryGetProperty("installUrl", out JsonElement installElement)
                                    ? installElement.GetString() ?? ""
                                    : "",
                                WarningMessage = plugin.TryGetProperty("warningMessage", out JsonElement warningElement)
                                    ? warningElement.GetString() ?? ""
                                    : "",
                                Authors = authorsArray
                            };

                            if (!string.IsNullOrWhiteSpace(result.Name))
                            {
                                plugins.Add(result);
                            }
                        }
                        catch (InvalidOperationException ex)
                        {
                            Utils.Logger.Error($"Error parsing individual plugin: {ex.Message}", ex);
                            continue;
                        }
                    }
                }

                return plugins;
            }
            catch (JsonException ex)
            {
                Utils.Logger.Error($"Error parsing JSON: {ex.Message}", ex);
                return plugins;
            }
        }

        private static int LevenshteinDistance(string s1, string s2)
        {
            if (s1.Length == 0)
            {
                return s2.Length;
            }
            if (s2.Length == 0)
            {
                return s1.Length;
            }

            int[][] d = new int[s1.Length + 1][];
            for (int i = 0; i <= s1.Length; i++)
            {
                d[i] = new int[s2.Length + 1];
            }

            for (int i = 0; i <= s1.Length; i++)
            {
                d[i][0] = i;
            }

            for (int j = 0; j <= s2.Length; j++)
            {
                d[0][j] = j;
            }

            for (int i = 1; i <= s1.Length; i++)
            {
                for (int j = 1; j <= s2.Length; j++)
                {
                    int cost = (s1[i - 1] == s2[j - 1]) ? 0 : 1;

                    d[i][j] = Math.Min(
                        Math.Min(d[i - 1][j] + 1, d[i][j - 1] + 1),
                        d[i - 1][j - 1] + cost);
                }
            }

            return d[s1.Length][s2.Length];
        }
    }

    internal sealed class PluginResult
    {
        public string Name { get; set; } = "";

        public string Description { get; set; } = "";

        public string Status { get; set; } = "unknown";

        public string SourceUrl { get; set; } = "";

        public string InstallUrl { get; set; } = "";

        public string WarningMessage { get; set; } = "";

        public List<string> Authors { get; set; } = [];
    }
}
