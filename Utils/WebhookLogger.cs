using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Utils
{
    public class WebhookLogger
    {
        private readonly HttpClient _http;
        private readonly string? _webhookUrl;

        public WebhookLogger(IConfiguration config)
        {
            _http = new HttpClient();
            _webhookUrl = config["LOG_WEBHOOK_URL"];
        }

        public async Task LogInfoAsync(string message)
        {
            await SendLogAsync("INFO", message, 0x00FF00);
        }

        public async Task LogWarningAsync(string message)
        {
            await SendLogAsync("WARN", message, 0xFFA500);
        }

        public async Task LogErrorAsync(string message, Exception? ex = null)
        {
            var fullMessage = ex != null ? $"{message}\n{ex.Message}\n{ex.StackTrace}" : message;
            await SendLogAsync("ERROR", fullMessage, 0xFF0000);
        }

        private async Task SendLogAsync(string level, string message, int color)
        {
            if (string.IsNullOrEmpty(_webhookUrl))
                return;

            try
            {
                var embed = new
                {
                    title = $"[{level}] ShiggyBot",
                    description = message.Length > 2000 ? message.Substring(0, 2000) : message,
                    color = color,
                    timestamp = DateTime.UtcNow
                };

                var payload = new
                {
                    embeds = new[] { embed }
                };

                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                await _http.PostAsync(_webhookUrl, content);
            }
            catch (Exception ex)
            {
                ErrorHandler.LogError("Webhook logging failed", ex);
            }
        }
    }
}
