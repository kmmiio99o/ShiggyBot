using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace ShiggyBot.Services
{
    public class PluginService
    {
        private readonly HttpClient _http;
        private const string PluginDataUrl = "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/main/src/plugins-data.json";

        public PluginService()
        {
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("User-Agent", "ShiggyBot");
        }

        public async Task<PluginResult?> SearchPluginAsync(string query)
        {
            try
            {
                var json = await _http.GetStringAsync(PluginDataUrl);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                PluginResult? bestMatch = null;
                int bestDistance = int.MaxValue;

                foreach (var plugin in root.EnumerateArray())
                {
                    var name = plugin.GetProperty("name").GetString() ?? "";
                    var distance = LevenshteinDistance(name.ToLower(), query.ToLower());
                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        bestMatch = new PluginResult
                        {
                            Name = name,
                            Description = plugin.GetProperty("description").GetString() ?? "",
                            Url = plugin.GetProperty("url").GetString() ?? "",
                            Status = plugin.GetProperty("status").GetString() ?? ""
                        };
                    }
                }

                return bestDistance <= 3 ? bestMatch : null;
            }
            catch
            {
                return null;
            }
        }

        private static int LevenshteinDistance(string s1, string s2)
        {
            var d = new int[s1.Length + 1, s2.Length + 1];
            for (int i = 0; i <= s1.Length; i++) d[i, 0] = i;
            for (int j = 0; j <= s2.Length; j++) d[0, j] = j;

            for (int i = 1; i <= s1.Length; i++)
                for (int j = 1; j <= s2.Length; j++)
                {
                    var cost = s1[i - 1] == s2[j - 1] ? 0 : 1;
                    d[i, j] = Math.Min(
                        Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + cost);
                }
            return d[s1.Length, s2.Length];
        }
    }

    public class PluginResult
    {
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Url { get; set; } = "";
        public string Status { get; set; } = "";
    }
}
