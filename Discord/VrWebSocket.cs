using Discord.Net.WebSockets;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text;

namespace ShiggyBot.Discord
{
    internal sealed class VrWebSocket : IWebSocketClient
    {
        private readonly IWebSocketClient _inner;
        private bool _pendingIdentify = true;

        public VrWebSocket(IWebSocketClient inner)
        {
            _inner = inner;
            _inner.BinaryMessage += (data, index, count) => BinaryMessage?.Invoke(data, index, count);
            _inner.TextMessage += OnTextMessage;
            _inner.Closed += (ex) => Closed?.Invoke(ex);
        }

        private Task OnTextMessage(string text)
        {
            try
            {
                JObject frame = JObject.Parse(text);
                if (frame.Value<int>("op") == 9)
                {
                    _pendingIdentify = true;
                }
            }
            catch (JsonReaderException)
            {
            }

            return TextMessage?.Invoke(text) ?? Task.CompletedTask;
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
            _pendingIdentify = true;
            return _inner.ConnectAsync(host);
        }

        public Task DisconnectAsync(int closeCode = 1000)
        {
            return _inner.DisconnectAsync(closeCode);
        }

        public async Task SendAsync(byte[] data, int index, int count, bool isText)
        {
            if (isText && _pendingIdentify)
            {
                try
                {
                    string json = Encoding.UTF8.GetString(data, index, count);
                    JObject frame = JObject.Parse(json);
                    if (frame.Value<int>("op") == 2)
                    {
                        _pendingIdentify = false;
                        if (frame["d"] is JObject identify && identify["properties"] is JObject props)
                        {
                            string? originalOs = props.Value<string>("$os");
                            props["$browser"] = "Discord VR";
                            props["$device"] = "Oculus Quest 2";
                            props["$os"] = originalOs ?? "Android";
                            data = Encoding.UTF8.GetBytes(frame.ToString(Formatting.None));
                            index = 0;
                            count = data.Length;
                        }
                    }
                }
                catch (JsonReaderException)
                {
                }
                catch (InvalidOperationException)
                {
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
