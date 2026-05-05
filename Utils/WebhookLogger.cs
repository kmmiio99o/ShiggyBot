using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Utils
{
    /// <summary>
    /// Logger that sends log messages to a Discord webhook.
    /// </summary>
    internal sealed class WebhookLogger(IConfiguration config) : IDisposable
    {
        private readonly HttpClient _http = new();
        private readonly string? _webhookUrl = config["LOG_WEBHOOK_URL"];

        /// <summary>
        /// Logs an info message to the webhook.
        /// </summary>
        /// <param name="message">The message to log.</param>

        public async Task LogInfoAsync(string message)
        {
            await SendLogAsync("INFO", message, 0x00FF00).ConfigureAwait(false);
        }

        public async Task LogWarningAsync(string message)
        {
            ArgumentNullException.ThrowIfNull(message);
            await SendLogAsync("WARN", message, 0xFFA500).ConfigureAwait(false);
        }

        public async Task LogErrorAsync(string message, Exception? ex = null)
        {
            ArgumentNullException.ThrowIfNull(message);
            string fullMessage = ex != null ? $"{message}\n{ex.Message}\n{ex.StackTrace}" : message;
            await SendLogAsync("ERROR", fullMessage, 0xFF0000).ConfigureAwait(false);
        }

        private async Task SendLogAsync(string level, string message, int color)
        {
            if (string.IsNullOrEmpty(_webhookUrl))
            {
                return;
            }

            try
            {
                var embed = new
                {
                    title = $"[{level}] ShiggyBot",
                    description = message.Length > 2000 ? message[0..2000] : message,
                    color,
                    timestamp = DateTime.UtcNow
                };

                var payload = new
                {
                    embeds = new[] { embed }
                };

                string json = JsonSerializer.Serialize(payload);
                using StringContent content = new(json, Encoding.UTF8, "application/json");

                await _http.PostAsync(new Uri(_webhookUrl), content).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                ErrorHandler.LogError("Webhook logging failed", ex);
            }
            catch (TaskCanceledException ex)
            {
                ErrorHandler.LogError("Webhook logging timed out", ex);
            }
        }

        public void Dispose()
        {
            _http?.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
