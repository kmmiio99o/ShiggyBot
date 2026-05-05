using System.Text.RegularExpressions;
using Discord;
using Discord.WebSocket;
using System.Text.Json;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    internal sealed class CommitPreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new();

        public CommitPreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _http.DefaultRequestHeaders.Add("User-Agent", "ShiggyBot");
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot)
            {
                return;
            }
            string content = message.Content;

            string pattern = @"https?://github\.com/([\w\-]+)/([\w\-]+)/commit/([\w]+)";
            Match match = Regex.Match(content, pattern, RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                return;
            }

            string owner = match.Groups[1].Value;
            string repo = match.Groups[2].Value;
            string sha = match.Groups[3].Value;

            try
            {
                string url = $"https://api.github.com/repos/{owner}/{repo}/commits/{sha}";
                string response = await _http.GetStringAsync(new Uri(url)).ConfigureAwait(false);
                using JsonDocument doc = JsonDocument.Parse(response);
                JsonElement root = doc.RootElement;

                JsonElement commit = root.GetProperty("commit");
                string? msg = commit.GetProperty("message").GetString();
                string? author = commit.GetProperty("author").GetProperty("name").GetString();

                Embed embed = new EmbedBuilder()
                {
                    Title = $"Commit in {owner}/{repo}",
                    Description = $"**Message:** {msg}\n**Author:** {author}",
                    Color = Color.Purple,
                    Url = match.Value
                }.Build();

                await message.Channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                // Error handler for features expects (Exception, string) parameters
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CommitPreview").ConfigureAwait(false);
            }
            catch (JsonException ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CommitPreview").ConfigureAwait(false);
            }
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }
    }
}
