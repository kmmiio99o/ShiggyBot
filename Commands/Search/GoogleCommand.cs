using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Search
{
    public class GoogleCommand : ICommand
    {
        public string Name => "google";
        public string Description => "Search Google directly from Discord";
        public string Category => "Search";
        public string[] Aliases => new[] { "g", "search" };

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (args.Length == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Usage: google <query>"));
                return;
            }

            var query = string.Join(" ", args);
            var url = $"https://www.google.com/search?q={System.Uri.EscapeDataString(query)}";

            var embed = new EmbedBuilder
            {
                Title = "🔍 Google Search",
                Description = $"**Query:** {query}",
                Color = new Color(0x00FF00),
                Url = url
            };
            embed.AddField("Link", url);

            await message.Channel.SendMessageAsync(embed: embed.Build());
        }
    }
}
