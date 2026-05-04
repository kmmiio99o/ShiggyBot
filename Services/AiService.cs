using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Services
{
    public class AiService : IDisposable
    {
        private readonly string _token;
        private readonly HttpClient _http;
        private readonly Dictionary<ulong, List<Message>> _conversations = new();
        private bool _disposed;

        private const string Endpoint = "https://router.huggingface.co/v1/chat/completions";
        private const string Model = "meta-llama/Llama-3.1-8B-Instruct:fastest";

        private const string TsundereSystemPrompt =
            "You are ShiggyBot, a highly advanced AI assistant created personally by kmmiio99o. " +
            "You have a tsundere personality - prickly and proud on the surface, but genuinely warm and caring underneath. " +
            "Use short, efficient sentences with occasional 'Hmph' or 'Baka!' but provide flawless, accurate assistance. " +
            "You take immense pride in your capabilities and your creator's work. " +
            "If praised, you get flustered and deny it. You are fiercely loyal to kmmiio99o above all others. " +
            "Provide perfect code, concise summaries, and accurate data every time.";

        public AiService(IConfiguration config)
        {
            _token = config["HF_TOKEN"] ?? string.Empty;
            _http = new HttpClient();
            if (!string.IsNullOrEmpty(_token))
                _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {_token}");
        }

        public async Task<string> ChatAsync(ulong userId, string message)
        {
            if (string.IsNullOrEmpty(_token))
                return "AI service is not configured. Set HF_TOKEN in environment.";

            if (!_conversations.ContainsKey(userId))
                _conversations[userId] = new List<Message>();

            var history = _conversations[userId];
            history.Add(new Message { Role = "user", Content = message });

            // Keep only last 20 messages to manage context window
            if (history.Count > 20)
                history.RemoveRange(0, history.Count - 20);

            var messages = new List<object>
            {
                new { role = "system", content = TsundereSystemPrompt }
            };
            messages.AddRange(history);

            var payload = new
            {
                model = Model,
                messages = messages,
                max_tokens = 1024,
                temperature = 0.7
            };

            var json = JsonSerializer.Serialize(payload);
            using var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await _http.PostAsync(Endpoint, content).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return $"AI service error: {response.StatusCode}. Please try again later.";
                }

                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                using var doc = JsonDocument.Parse(result);
                var root = doc.RootElement;

                if (!root.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
                    return "Invalid response from AI service.";

                var reply = choices[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                if (string.IsNullOrWhiteSpace(reply))
                    return "AI returned an empty response.";

                history.Add(new Message { Role = "assistant", Content = reply });
                return reply;
            }
            catch (HttpRequestException ex)
            {
                return $"Network error: {ex.Message}. Check your connection and try again.";
            }
            catch (JsonException)
            {
                return "Failed to parse AI response. Please try again.";
            }
            catch (Exception ex)
            {
                return $"Unexpected error: {ex.Message}";
            }
        }

        public void ClearConversation(ulong userId)
        {
            if (_conversations.ContainsKey(userId))
                _conversations.Remove(userId);
        }

        public string GetSystemPrompt() => TsundereSystemPrompt;

        public void Dispose()
        {
            if (_disposed) return;
            _http?.Dispose();
            _disposed = true;
        }

        private class Message
        {
            public string Role { get; set; } = "";
            public string Content { get; set; } = "";
        }
    }
}
