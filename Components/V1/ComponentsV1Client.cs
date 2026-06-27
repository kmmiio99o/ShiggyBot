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
            ReadOnlySpan<byte> crlf = "\r\n"u8;
            ReadOnlySpan<byte> dashDash = "--"u8;
            byte[] boundaryBytes = Encoding.UTF8.GetBytes($"boundary_ShiggyBot_{Guid.NewGuid():N}");

            int totalSize = crlf.Length + dashDash.Length + boundaryBytes.Length +
                "\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"u8.Length +
                payloadJson.Length;

            foreach (V1Attachment attachment in builder.Attachments)
            {
                totalSize += crlf.Length + dashDash.Length + boundaryBytes.Length;
                totalSize += "\r\nContent-Disposition: form-data; name=\"files["u8.Length;
                totalSize += Formatting.CountDigits(attachment.Id);
                totalSize += "]\"; filename=\""u8.Length;
                totalSize += Encoding.UTF8.GetByteCount(attachment.FileName);
                totalSize += "\"\r\nContent-Type: application/octet-stream\r\n\r\n"u8.Length;
                totalSize += attachment.Data.Length;
            }

            totalSize += crlf.Length + dashDash.Length + boundaryBytes.Length + dashDash.Length + crlf.Length;

            byte[] buffer = new byte[totalSize];
            int offset = 0;

            offset = Write(buffer, offset, crlf);
            offset = Write(buffer, offset, dashDash);
            offset = Write(buffer, offset, boundaryBytes);
            offset = Write(buffer, offset, "\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"u8);
            offset = Write(buffer, offset, payloadJson);

            foreach (V1Attachment attachment in builder.Attachments)
            {
                offset = Write(buffer, offset, crlf);
                offset = Write(buffer, offset, dashDash);
                offset = Write(buffer, offset, boundaryBytes);
                offset = Write(buffer, offset, "\r\nContent-Disposition: form-data; name=\"files["u8);
                offset = Formatting.WriteInt32(buffer, offset, attachment.Id);
                offset = Write(buffer, offset, "]\"; filename=\""u8);
                offset = Write(buffer, offset, Encoding.UTF8.GetBytes(attachment.FileName));
                offset = Write(buffer, offset, "\"\r\nContent-Type: application/octet-stream\r\n\r\n"u8);
                offset = Write(buffer, offset, attachment.Data);
            }

            offset = Write(buffer, offset, crlf);
            offset = Write(buffer, offset, dashDash);
            offset = Write(buffer, offset, boundaryBytes);
            offset = Write(buffer, offset, dashDash);
            Write(buffer, offset, crlf);

            ByteArrayContent content = new(buffer);
            content.Headers.ContentType = new MediaTypeHeaderValue("multipart/form-data");
            content.Headers.ContentType.Parameters.Add(new NameValueHeaderValue("boundary", Encoding.UTF8.GetString(boundaryBytes)));
            return content;
        }

        private static int Write(byte[] buffer, int offset, ReadOnlySpan<byte> data)
        {
            data.CopyTo(buffer.AsSpan(offset));
            return offset + data.Length;
        }

        private static int Write(byte[] buffer, int offset, byte[] data)
        {
            data.CopyTo(buffer.AsSpan(offset));
            return offset + data.Length;
        }
    }
}
