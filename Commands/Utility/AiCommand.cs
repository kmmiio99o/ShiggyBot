using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Commands;
using ShiggyBot.Services;
using ShiggyBot.Utils;
using Microsoft.Extensions.Configuration;
using System.Linq;

namespace ShiggyBot.Commands.Utility
{
    public class AiCommand : ICommand
    {
        private readonly AiService _aiService;

        public AiCommand(IConfiguration config)
        {
            _aiService = new AiService(config);
        }

        public string Name => "ai";
        public string Description => "Chat with AI assistant powered by Gemini";
        public string Category => "Utility";
        public string[] Aliases => new[] { "gemini", "ask", "clearai" };

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            if (args.Length == 0)
            {
                var usageEmbed = new EmbedBuilder
                {
                    Title = "🔧 AI Command",
                    Description = "Chat with AI assistant powered by Gemini",
                    Color = new Color(0x1E90FF)
                };
                usageEmbed.AddField("Usage", "`ai <message>`", inline: false);
                usageEmbed.AddField("Clear Conversation", "`ai clear` or `clearai`", inline: false);
                usageEmbed.AddField("Aliases", "gemini, ask, clearai", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build());
                return;
            }

            if (args[0].ToLower() == "clear" || args[0].ToLower() == "clearai")
            {
                _aiService.ClearConversation(message.Author.Id);
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed("Conversation cleared."));
                return;
            }

            var query = string.Join(" ", args);
            var reply = await _aiService.ChatAsync(message.Author.Id, query);

            var embed = new EmbedBuilder
            {
                Title = "🤖 AI Response",
                Description = reply,
                Color = new Color(0x1E90FF)
            };
            embed.WithFooter($"Requested by {message.Author.Username}");
            embed.WithCurrentTimestamp();

            await message.Channel.SendMessageAsync(embed: embed.Build());
        }
    }
}
