using System.Text.RegularExpressions;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Features
{
    internal sealed class CodePreviewFeature
    {
        private readonly DiscordSocketClient _client;
        private static readonly HttpClient _http = new();

        public CodePreviewFeature(DiscordSocketClient client)
        {
            _client = client;
            _client.MessageReceived += OnMessageReceivedAsync;
        }

        private async Task OnMessageReceivedAsync(SocketMessage message)
        {
            if (message.Author.IsBot)
            {
                return;
            }
            string content = message.Content;

            string pattern = @"https?://(github\.com|gitlab\.com|bitbucket\.org|gitea\.com|forgejo\.org|codeberg\.org|git\.gay)/([\w\-]+)/([\w\-]+)/(blob|src)/([\w\-]+)/([\w\-./]+\.(cs|js|ts|py|java|cpp|go|rs|d\.ts))";
            Match match = Regex.Match(content, pattern, RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                return;
            }

            string url = match.Value;
            string provider = match.Groups[1].Value;
            string? rawUrl = ConvertToRawUrl(url, provider);
            if (rawUrl == null)
            {
                return;
            }

            try
            {
                string response = await _http.GetStringAsync(new Uri(rawUrl)).ConfigureAwait(false);
                string[] lines = response.Split('\n');
                string preview = string.Join('\n', lines.Take(20));
                Discord.Embed embed = new Discord.EmbedBuilder()
                {
                    Title = "Code Preview",
                    Description = $"```{preview}```",
                    Color = Discord.Color.Blue,
                    Url = url
                }.Build();
                await message.Channel.SendMessageAsync(embed: embed).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                // Error handler for features expects (Exception, string) parameters
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CodePreview").ConfigureAwait(false);
            }
            catch (RegexMatchTimeoutException ex)
            {
                await ErrorHandler.HandleFeatureErrorAsync(ex, "CodePreview").ConfigureAwait(false);
            }
        }

        private static string? ConvertToRawUrl(string url, string provider)
        {
            return provider.ToUpperInvariant() switch
            {
                "github.com" => url.Replace("github.com", "raw.githubusercontent.com", StringComparison.Ordinal).Replace("/blob/", "/", StringComparison.Ordinal),
                "gitlab.com" => url.Replace("/blob/", "/raw/", StringComparison.Ordinal),
                "bitbucket.org" => url.Replace("/src/", "/raw/", StringComparison.Ordinal),
                "gitea.com" => url.Replace("/src/", "/raw/", StringComparison.Ordinal).Replace("/blob/", "/raw/", StringComparison.Ordinal),
                "forgejo.org" => url.Replace("/src/", "/raw/", StringComparison.Ordinal).Replace("/blob/", "/raw/", StringComparison.Ordinal),
                "codeberg.org" => url.Replace("/src/", "/raw/", StringComparison.Ordinal).Replace("/blob/", "/raw/", StringComparison.Ordinal),
                "git.gay" => url.Replace("/src/", "/raw/", StringComparison.Ordinal).Replace("/blob/", "/raw/", StringComparison.Ordinal),
                _ => null
            };
        }

        public void Unregister()
        {
            _client.MessageReceived -= OnMessageReceivedAsync;
        }
    }
}
