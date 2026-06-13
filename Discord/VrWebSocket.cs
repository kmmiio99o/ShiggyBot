using Discord.Net.WebSockets;
using System.Text;

namespace ShiggyBot.Discord
{
    internal sealed class VrWebSocket : IWebSocketClient
    {
        private readonly IWebSocketClient _inner;

        public VrWebSocket(IWebSocketClient inner)
        {
            _inner = inner;
            _inner.BinaryMessage += (data, index, count) => BinaryMessage?.Invoke(data, index, count);
            _inner.TextMessage += (text) => TextMessage?.Invoke(text);
            _inner.Closed += (ex) => Closed?.Invoke(ex);
        }

        public event Func<byte[], int, int, Task>? BinaryMessage;
        public event Func<string, Task>? TextMessage;
        public event Func<Exception, Task>? Closed;

        public void SetHeader(string key, string value)
        {
            _inner.SetHeader(key, value);
        }

        public void SetCancelToken(CancellationToken cancelToken)
        {
            _inner.SetCancelToken(cancelToken);
        }

        public Task ConnectAsync(string host)
        {
            return _inner.ConnectAsync(host);
        }

        public Task DisconnectAsync(int closeCode = 1000)
        {
            return _inner.DisconnectAsync(closeCode);
        }

        public async Task SendAsync(byte[] data, int index, int count, bool isText)
        {
            if (isText)
            {
                string json = Encoding.UTF8.GetString(data, index, count);
                if (json.Contains("\"op\":2", StringComparison.Ordinal) || json.Contains("\"op\": 2", StringComparison.Ordinal))
                {
                    json = json.Replace(
                        "\"$browser\":\"Discord.Net\"",
                        "\"$browser\":\"Discord VR\"", StringComparison.Ordinal);
                    json = json.Replace(
                        "\"$device\":\"Discord.Net\"",
                        "\"$device\":\"VR\"", StringComparison.Ordinal);
                    json = json.Replace(
                        "\"$os\":\"" + Environment.OSVersion.Platform + "\"",
                        "\"$os\":\"Oculus Quest\"", StringComparison.Ordinal);
                    data = Encoding.UTF8.GetBytes(json);
                    index = 0;
                    count = data.Length;
                }
            }
            await _inner.SendAsync(data, index, count, isText).ConfigureAwait(false);
        }

        public void Dispose()
        {
            _inner.Dispose();
        }
    }
}
