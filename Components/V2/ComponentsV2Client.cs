using System.Net.Http.Headers;
using ShiggyBot.Utils;

namespace ShiggyBot.Components.V2
{
    /// <summary>HTTP client for sending Components V2 messages via Discord's REST API.</summary>
    internal sealed class ComponentsV2Client : IDisposable
    {
        private const int IsComponentsV2Flag = 1 << 15;
        private static readonly MediaTypeHeaderValue JsonContentType = new("application/json");

        private readonly HttpClient _http;
        private readonly string _baseUrl;

        /// <summary>Creates a new ComponentsV2Client.</summary>
        public ComponentsV2Client(string token, HttpClient? httpClient = null)
        {
            ArgumentNullException.ThrowIfNull(token);
            _http = httpClient ?? new HttpClient();
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bot", token);
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("ShiggyBot");
            _baseUrl = "https://discord.com/api/v10";
        }

        /// <summary>Sends a V2 component message to a channel.</summary>
        public async Task<bool> SendMessageAsync(
            ulong channelId,
            V2MessageBuilder builder,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(builder);

            byte[] payload = builder
                .WithFlags(IsComponentsV2Flag)
                .Build();

            Uri url = new($"{_baseUrl}/channels/{channelId}/messages");
            bool hasAttachments = builder.AttachmentCount > 0;

            for (int attempt = 0; attempt < 3; attempt++)
            {
                HttpResponseMessage response;
                if (hasAttachments)
                {
                    using MultipartFormDataContent content = [];
                    List<ByteArrayContent> parts = [];

                    ByteArrayContent payloadPart = new(payload)
                    {
                        Headers = { ContentType = JsonContentType }
                    };
                    parts.Add(payloadPart);
                    content.Add(payloadPart, "payload_json");

                    for (int i = 0; i < builder.AttachmentCount; i++)
                    {
                        V2MessageBuilder.AttachmentEntry attachment = builder.GetAttachment(i);
                        ByteArrayContent filePart = new(attachment.Content)
                        {
                            Headers = { ContentType = MediaTypeHeaderValue.Parse("application/octet-stream") }
                        };
                        parts.Add(filePart);
                        content.Add(filePart, $"files[{i}]", attachment.Filename);
                    }

                    response = await _http.PostAsync(url, content, cancellationToken)
                        .ConfigureAwait(false);

                    foreach (ByteArrayContent part in parts)
                    {
                        part.Dispose();
                    }
                }
                else
                {
                    using ByteArrayContent content = new(payload);
                    content.Headers.ContentType = JsonContentType;

                    response = await _http.PostAsync(url, content, cancellationToken)
                        .ConfigureAwait(false);
                }

                using (response)
                {
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
                            Logger.Warn($"[V2] Rate limited, retrying after {seconds}s");
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

                    Logger.Error($"[V2] Failed to send message: {response.StatusCode} {body}");
                    return false;
                }
            }

            return false;
        }

        /// <summary>Edits an existing message with V2 components.</summary>
        public async Task<bool> EditMessageAsync(
            ulong channelId,
            ulong messageId,
            V2MessageBuilder builder,
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

                Logger.Error($"[V2] Failed to edit message: {response.StatusCode} {body}");
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
