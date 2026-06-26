using System.Net.Http.Headers;
using ShiggyBot.Utils;

namespace ShiggyBot.Components.V1
{
    /// <summary>HTTP client for sending V1 messages via Discord's REST API.</summary>
    internal sealed class ComponentsV1Client : IDisposable
    {
        private static readonly MediaTypeHeaderValue JsonContentType = new("application/json");

        private readonly HttpClient _http;
        private readonly string _baseUrl;

        /// <summary>Creates a new ComponentsV1Client.</summary>
        public ComponentsV1Client(string token, HttpClient? httpClient = null)
        {
            ArgumentNullException.ThrowIfNull(token);
            _http = httpClient ?? new HttpClient();
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bot", token);
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("ShiggyBot");
            _baseUrl = "https://discord.com/api/v10";
        }

        /// <summary>Sends a V1 message to a channel.</summary>
        public async Task<bool> SendMessageAsync(
            ulong channelId,
            V1MessageBuilder builder,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(builder);

            byte[] payload = builder.Build();
            Uri url = new($"{_baseUrl}/channels/{channelId}/messages");

            for (int attempt = 0; attempt < 3; attempt++)
            {
                using ByteArrayContent content = new(payload);
                content.Headers.ContentType = JsonContentType;

                using HttpResponseMessage response = await _http.PostAsync(url, content, cancellationToken)
                    .ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    return true;
                }

                if ((int)response.StatusCode == 429)
                {
                    string retryAfter = response.Headers.TryGetValues("Retry-After", out IEnumerable<string>? values)
                        ? values.FirstOrDefault() ?? "1"
                        : "1";

                    if (int.TryParse(retryAfter, out int seconds) && seconds > 0)
                    {
                        Logger.Warn($"[V1] Rate limited, retrying after {seconds}s");
                        await Task.Delay(TimeSpan.FromSeconds(seconds), cancellationToken).ConfigureAwait(false);
                        continue;
                    }
                }

                string? body = null;
                try
                {
                    body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (HttpRequestException)
                {
                }
                catch (InvalidOperationException)
                {
                }

                Logger.Error($"[V1] Failed to send message: {response.StatusCode} {body}");
                return false;
            }

            return false;
        }

        /// <summary>Edits a V1 message.</summary>
        public async Task<bool> EditMessageAsync(
            ulong channelId,
            ulong messageId,
            V1MessageBuilder builder,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(builder);

            byte[] payload = builder.Build();

            using ByteArrayContent content = new(payload);
            content.Headers.ContentType = JsonContentType;

            Uri url = new($"{_baseUrl}/channels/{channelId}/messages/{messageId}");

            using HttpResponseMessage response = await _http.PatchAsync(url, content, cancellationToken)
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                string? body = null;
                try
                {
                    body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (HttpRequestException)
                {
                }
                catch (InvalidOperationException)
                {
                }

                Logger.Error($"[V1] Failed to edit message: {response.StatusCode} {body}");
                return false;
            }

            return true;
        }

        /// <summary>Disposes the underlying HttpClient.</summary>
        public void Dispose()
        {
            _http.Dispose();
        }
    }
}
