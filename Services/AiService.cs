using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Services
{
    internal sealed class AiService : IDisposable
    {
        private readonly string _token;
        private readonly HttpClient _http;
        private readonly Dictionary<ulong, List<Message>> _conversations = [];

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
            ArgumentNullException.ThrowIfNull(config);
            _token = config["HF_TOKEN"] ?? string.Empty;
            _http = new HttpClient();
            if (!string.IsNullOrEmpty(_token))
            {
                _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {_token}");
            }
        }

        public async Task<string> ChatAsync(ulong userId, string message)
        {
            if (string.IsNullOrEmpty(_token))
            {
                return "AI service is not configured. Set HF_TOKEN in environment.";
            }

            if (!_conversations.TryGetValue(userId, out List<Message>? history))
            {
                history = [];
                _conversations[userId] = history;
            }
            history.Add(new Message { Role = "user", Content = message });

            // Keep only last 20 messages to manage context window
            if (history.Count > 20)
            {
                history.RemoveRange(0, history.Count - 20);
            }

            List<object> messages =
            [
                new { role = "system", content = TsundereSystemPrompt },
                .. history
            ];

            var payload = new
            {
                model = Model,
                messages,
                max_tokens = 1024,
                temperature = 0.7
            };

            string json = JsonSerializer.Serialize(payload);
            using StringContent content = new(json, Encoding.UTF8, "application/json");

            try
            {
                HttpResponseMessage response = await _http.PostAsync(new Uri(Endpoint), content).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    string error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    return $"AI service error: {response.StatusCode}. Please try again later.";
                }

                string result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                using JsonDocument doc = JsonDocument.Parse(result);
                JsonElement root = doc.RootElement;

                if (!root.TryGetProperty("choices", out JsonElement choices) || choices.GetArrayLength() == 0)
                {
                    return "Invalid response from AI service.";
                }

                string? reply = choices[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                if (string.IsNullOrWhiteSpace(reply))
                {
                    return "AI returned an empty response.";
                }

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
            catch (TaskCanceledException ex)
            {
                return $"Request timeout: {ex.Message}. Please try again.";
            }
        }

        public void ClearConversation(ulong userId)
        {
            _conversations.Remove(userId);
        }

        public static string GetSystemPrompt()
        {
            return TsundereSystemPrompt;
        }

        public void Dispose()
        {
            _http?.Dispose();
            GC.SuppressFinalize(this);
        }

        private sealed class Message
        {
            public string Role { get; set; } = "";
            public string Content { get; set; } = "";
        }
    }
}
