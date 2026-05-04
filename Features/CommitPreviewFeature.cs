using System;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using System.Net.Http;
using System.Text.Json;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    public class CommitPreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new HttpClient();

        public CommitPreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _http.DefaultRequestHeaders.Add("User-Agent", "ShiggyBot");
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot) return;
            var content = message.Content;

            var pattern = @"https?://github\.com/([\w\-]+)/([\w\-]+)/commit/([\w]+)";
            var match = Regex.Match(content, pattern, RegexOptions.IgnoreCase);
            if (!match.Success) return;

            var owner = match.Groups[1].Value;
            var repo = match.Groups[2].Value;
            var sha = match.Groups[3].Value;

            try
            {
                var url = $"https://api.github.com/repos/{owner}/{repo}/commits/{sha}";
                var response = await _http.GetStringAsync(url);
                using var doc = JsonDocument.Parse(response);
                var root = doc.RootElement;

                var commit = root.GetProperty("commit");
                var msg = commit.GetProperty("message").GetString();
                var author = commit.GetProperty("author").GetProperty("name").GetString();

                var embed = new EmbedBuilder
                {
                    Title = $"Commit in {owner}/{repo}",
                    Description = $"**Message:** {msg}\n**Author:** {author}",
                    Color = Color.Purple,
                    Url = match.Value
                }.Build();

                await message.Channel.SendMessageAsync(embed: embed);
            }
            catch (Exception ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(message, ex, "CommitPreview");
            }
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }
    }
}
