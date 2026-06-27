using System.Net.Http.Headers;
using System.Text;
using ShiggyBot.Utils;

namespace ShiggyBot.Components.V1
{
    internal sealed class ComponentsV1Client : IDisposable
    {
        private static readonly MediaTypeHeaderValue JsonContentType = new("application/json");

        private readonly HttpClient _http;
        private readonly string _baseUrl;

        public ComponentsV1Client(string token, HttpClient? httpClient = null)
        {
            ArgumentNullException.ThrowIfNull(token);
            _http = httpClient ?? new HttpClient();
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bot", token);
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("ShiggyBot");
            _baseUrl = "https://discord.com/api/v10";
        }

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
                using HttpContent content = builder.HasAttachments
                    ? BuildMultipartContent(payload, builder)
                    : BuildJsonContent(payload);

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

        public void Dispose()
        {
            _http.Dispose();
        }

        private static ByteArrayContent BuildJsonContent(byte[] payload)
        {
            ByteArrayContent content = new(payload);
            content.Headers.ContentType = JsonContentType;
            return content;
        }

        private static ByteArrayContent BuildMultipartContent(byte[] payloadJson, V1MessageBuilder builder)
        {
            string boundary = $"ShiggyBot_{Guid.NewGuid():N}";

            using MemoryStream ms = new();
            WriteMultipartPart(ms, boundary, "payload_json", "application/json", payloadJson);

            foreach (V1Attachment attachment in builder.Attachments)
            {
                WriteMultipartFile(ms, boundary, attachment);
            }

            ms.Write(Encoding.UTF8.GetBytes($"\r\n--{boundary}--\r\n"));

            ByteArrayContent content = new(ms.ToArray());
            content.Headers.ContentType = new MediaTypeHeaderValue("multipart/form-data");
            content.Headers.ContentType.Parameters.Add(new NameValueHeaderValue("boundary", boundary));
            return content;
        }

        private static void WriteMultipartPart(Stream stream, string boundary, string name, string contentType, byte[] data)
        {
            stream.Write(Encoding.UTF8.GetBytes($"--{boundary}\r\n"));
            stream.Write(Encoding.UTF8.GetBytes($"Content-Disposition: form-data; name=\"{name}\"\r\n"));
            stream.Write(Encoding.UTF8.GetBytes($"Content-Type: {contentType}\r\n\r\n"));
            stream.Write(data);
        }

        private static void WriteMultipartFile(Stream stream, string boundary, V1Attachment attachment)
        {
            stream.Write(Encoding.UTF8.GetBytes($"--{boundary}\r\n"));
            stream.Write(Encoding.UTF8.GetBytes($"Content-Disposition: form-data; name=\"files[{attachment.Id}]\"; filename=\"{attachment.FileName}\"\r\n"));
            stream.Write(Encoding.UTF8.GetBytes("Content-Type: application/octet-stream\r\n\r\n"));
            stream.Write(attachment.Data);
        }
    }
}
