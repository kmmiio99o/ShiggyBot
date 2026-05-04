using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace ShiggyBot.Services
{
    public class PluginService
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
                return null;

            try
            {
                var plugins = await GetAllPluginsAsync();
                if (plugins == null || plugins.Count == 0)
                    return null;

                PluginResult? bestMatch = null;
                int bestDistance = int.MaxValue;
                const int maxDistance = 5;

                foreach (var plugin in plugins)
                {
                    // Check both name and description for matches
                    var nameDistance = LevenshteinDistance(plugin.Name.ToLower(), query.ToLower());
                    var descriptionDistance = LevenshteinDistance(plugin.Description.ToLower(), query.ToLower());

                    var distance = Math.Min(nameDistance, descriptionDistance);

                    if (distance < bestDistance && distance <= maxDistance)
                    {
                        bestDistance = distance;
                        bestMatch = plugin;
                    }

                    // Exact match - return immediately
                    if (plugin.Name.Equals(query, StringComparison.OrdinalIgnoreCase))
                        return plugin;
                }

                return bestMatch;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error searching plugins: {ex.Message}");
                return null;
            }
        }

        public async Task<List<PluginResult>> SearchPluginsAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return new List<PluginResult>();

            try
            {
                var plugins = await GetAllPluginsAsync();
                if (plugins == null)
                    return new List<PluginResult>();

                var query_lower = query.ToLower();
                var results = new List<(PluginResult plugin, int score)>();

                foreach (var plugin in plugins)
                {
                    var score = 0;

                    // Exact name match
                    if (plugin.Name.Equals(query, StringComparison.OrdinalIgnoreCase))
                        score += 1000;

                    // Partial name match
                    if (plugin.Name.ToLower().Contains(query_lower))
                        score += 500;

                    // Description contains query
                    if (plugin.Description.ToLower().Contains(query_lower))
                        score += 100;

                    if (score > 0)
                        results.Add((plugin, score));
                }

                // Sort by score and take top 10 results
                return results
                    .OrderByDescending(x => x.score)
                    .Take(10)
                    .Select(x => x.plugin)
                    .ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error searching plugins: {ex.Message}");
                return new List<PluginResult>();
            }
        }

        private async Task<List<PluginResult>?> GetAllPluginsAsync()
        {
            // Return cached plugins if still valid
            if (_cachedPlugins != null && DateTime.UtcNow < _cacheExpiry)
                return _cachedPlugins;

            try
            {
                var json = await _http.GetStringAsync(PluginDataUrl);
                _cachedPlugins = ParsePluginsJson(json);
                _cacheExpiry = DateTime.UtcNow.AddMinutes(CacheMinutes);
                return _cachedPlugins;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching plugins from {PluginDataUrl}: {ex.Message}");
                return _cachedPlugins; // Return cached data if available
            }
        }

        private List<PluginResult> ParsePluginsJson(string json)
        {
            var plugins = new List<PluginResult>();

            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.ValueKind == JsonValueKind.Array)
                {
                    foreach (var plugin in root.EnumerateArray())
                    {
                        try
                        {
                            var authorsArray = new List<string>();
                            if (plugin.TryGetProperty("authors", out var authorsElement) && authorsElement.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var author in authorsElement.EnumerateArray())
                                {
                                    if (author.GetString() is string authorName)
                                        authorsArray.Add(authorName);
                                }
                            }

                            var result = new PluginResult
                            {
                                Name = plugin.TryGetProperty("name", out var nameElement)
                                    ? nameElement.GetString() ?? "Unknown"
                                    : "Unknown",
                                Description = plugin.TryGetProperty("description", out var descElement)
                                    ? descElement.GetString() ?? "No description"
                                    : "No description",
                                Status = plugin.TryGetProperty("status", out var statusElement)
                                    ? statusElement.GetString() ?? "unknown"
                                    : "unknown",
                                SourceUrl = plugin.TryGetProperty("sourceUrl", out var sourceElement)
                                    ? sourceElement.GetString() ?? ""
                                    : "",
                                InstallUrl = plugin.TryGetProperty("installUrl", out var installElement)
                                    ? installElement.GetString() ?? ""
                                    : "",
                                WarningMessage = plugin.TryGetProperty("warningMessage", out var warningElement)
                                    ? warningElement.GetString() ?? ""
                                    : "",
                                Authors = authorsArray
                            };

                            if (!string.IsNullOrWhiteSpace(result.Name))
                                plugins.Add(result);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"Error parsing individual plugin: {ex.Message}");
                            continue;
                        }
                    }
                }

                return plugins;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing JSON: {ex.Message}");
                return plugins;
            }
        }

        private static int LevenshteinDistance(string s1, string s2)
        {
            if (s1.Length == 0) return s2.Length;
            if (s2.Length == 0) return s1.Length;

            var d = new int[s1.Length + 1, s2.Length + 1];

            for (int i = 0; i <= s1.Length; i++)
                d[i, 0] = i;

            for (int j = 0; j <= s2.Length; j++)
                d[0, j] = j;

            for (int i = 1; i <= s1.Length; i++)
            {
                for (int j = 1; j <= s2.Length; j++)
                {
                    var cost = s1[i - 1] == s2[j - 1] ? 0 : 1;

                    d[i, j] = Math.Min(
                        Math.Min(
                            d[i - 1, j] + 1,
                            d[i, j - 1] + 1
                        ),
                        d[i - 1, j - 1] + cost
                    );
                }
            }

            return d[s1.Length, s2.Length];
        }
    }

    public class PluginResult
    {
        public string Name { get; set; } = "";

        public string Description { get; set; } = "";

        public string Status { get; set; } = "unknown";

        public string SourceUrl { get; set; } = "";

        public string InstallUrl { get; set; } = "";

        public string WarningMessage { get; set; } = "";

        public List<string> Authors { get; set; } = new();
    }
}
