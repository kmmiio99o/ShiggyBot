using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Search
{
    public class PluginCommand : ICommand
    {
        public string Name => "plugin";
        public string Description => "Search for plugins and extensions";
        public string Category => "Search";
        public string[] Aliases => new[] { "plugins", "plg", "plug" };

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (args.Length == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Usage: plugin <name>"));
                return;
            }

            var pluginName = string.Join(" ", args);

            var embed = new EmbedBuilder
            {
                Title = "🔌 Plugin Search",
                Description = $"Searching for plugin: **{pluginName}**",
                Color = new Color(0x00FF00)
            };
            embed.AddField("Status", "Plugin search service coming soon!", inline: false);
            embed.AddField("Suggestion", "Try searching on [DiscordBotList](https://top.gg) or [GitHub](https://github.com)", inline: false);

            await message.Channel.SendMessageAsync(embed: embed.Build());
        }
    }
}
