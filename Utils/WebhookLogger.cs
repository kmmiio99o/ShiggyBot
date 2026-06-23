using System.Text;
using System.Text.Json;

namespace ShiggyBot.Utils
{
    internal static class WebhookLogger
    {
        private static readonly HttpClient _http = new() { DefaultRequestHeaders = { { "User-Agent", "ShiggyBot/1.0" } } };

        public static async Task SendErrorAsync(string? webhookUrl, string message, Exception? ex = null, string title = "❌ ShiggyBot Error")
        {
            if (string.IsNullOrEmpty(webhookUrl))
            {
                return;
            }

            try
            {
                string description = ex != null
                    ? $"{message}\n```\n{ex}\n```"
                    : message;
                description = description.Length > 2000 ? description[..2000] : description;

                var embed = new
                {
                    title,
                    description,
                    color = 0xFF0000,
                    timestamp = DateTime.UtcNow
                };

                var payload = new
                {
                    content = "<@879393496627306587>",
                    embeds = new[] { embed },
                    allowed_mentions = new { users = new[] { "879393496627306587" } }
                };

                string json = JsonSerializer.Serialize(payload);
                using StringContent content = new(json, Encoding.UTF8, "application/json");

                await _http.PostAsync(new Uri(webhookUrl), content).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
            }
            catch (TaskCanceledException)
            {
            }
            catch (InvalidOperationException)
            {
            }
        }
    }
}
