using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using System.Net.Http;
using System.Net;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    public class CodePreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new HttpClient();

        public CodePreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot) return;
            var content = message.Content;

            var pattern = @"https?://(github\.com|gitlab\.com|bitbucket\.org|gitea\.com|forgejo\.org|codeberg\.org|git\.gay)/([\w\-]+)/([\w\-]+)/(blob|src)/([\w\-]+)/([\w\-./]+\.(cs|js|ts|py|java|cpp|go|rs|d\.ts))";
            var match = Regex.Match(content, pattern, RegexOptions.IgnoreCase);
            if (!match.Success) return;

            var url = match.Value;
            var provider = match.Groups[1].Value;
            var rawUrl = ConvertToRawUrl(url, provider);
            if (rawUrl == null) return;

            try
            {
                var response = await _http.GetStringAsync(rawUrl);
                var lines = response.Split('\n');
                var preview = string.Join('\n', lines.Take(20));
                var embed = new Discord.EmbedBuilder
                {
                    Title = "Code Preview",
                    Description = $"```{preview}```",
                    Color = Discord.Color.Blue,
                    Url = url
                }.Build();
                await message.Channel.SendMessageAsync(embed: embed);
            }
            catch (Exception ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(message, ex, "CodePreview");
            }
        }

        private static string? ConvertToRawUrl(string url, string provider)
        {
            return provider.ToLower() switch
            {
                "github.com" => url.Replace("github.com", "raw.githubusercontent.com").Replace("/blob/", "/"),
                "gitlab.com" => url.Replace("/blob/", "/raw/"),
                "bitbucket.org" => url.Replace("/src/", "/raw/"),
                "gitea.com" => url.Replace("/src/", "/raw/").Replace("/blob/", "/raw/"),
                "forgejo.org" => url.Replace("/src/", "/raw/").Replace("/blob/", "/raw/"),
                "codeberg.org" => url.Replace("/src/", "/raw/").Replace("/blob/", "/raw/"),
                "git.gay" => url.Replace("/src/", "/raw/").Replace("/blob/", "/raw/"),
                _ => null
            };
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }
    }
}
