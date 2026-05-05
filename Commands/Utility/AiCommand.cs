using Discord;
using Discord.WebSocket;
using ShiggyBot.Services;
using ShiggyBot.Utils;
using Microsoft.Extensions.Configuration;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to chat with AI assistant powered by Gemini.
    /// </summary>
    internal sealed class AiCommand(IConfiguration config) : ICommand, IDisposable
    {
        private readonly AiService _aiService = new(config);

        /// <summary>
        /// Disposes the AI service.
        /// </summary>
        public void Dispose()
        {
            _aiService?.Dispose();
            GC.SuppressFinalize(this);
        }

        /// <summary>
        /// Gets the name of the command.
        /// </summary>
        public string Name => "ai";

        /// <summary>
        /// Gets the description of the command.
        /// </summary>
        public string Description => "Chat with AI assistant powered by Gemini";

        /// <summary>
        /// Gets the category of the command.
        /// </summary>
        public string Category => "Utility";

        /// <summary>
        /// Gets the aliases for the command.
        /// </summary>
        public string[] Aliases => ["gemini", "ask", "clearai"];

        /// <summary>
        /// Executes the AI chat command.
        /// </summary>
        /// <param name="message">The user message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (args.Length == 0)
            {
                EmbedBuilder usageEmbed = new()
                {
                    Title = "🔧 AI Command",
                    Description = "Chat with AI assistant powered by Gemini",
                    Color = new Color(0x1E90FF)
                };
                usageEmbed.AddField("Usage", "`ai <message>`", inline: false);
                usageEmbed.AddField("Clear Conversation", "`ai clear` or `clearai`", inline: false);
                usageEmbed.AddField("Aliases", "gemini, ask, clearai", inline: false);
                await message.Channel.SendMessageAsync(embed: usageEmbed.Build()).ConfigureAwait(false);
                return;
            }

            if (args[0].Equals("clear", StringComparison.OrdinalIgnoreCase) || args[0].Equals("clearai", StringComparison.OrdinalIgnoreCase))
            {
                _aiService.ClearConversation(message.Author.Id);
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildSuccessEmbed("Conversation cleared.")).ConfigureAwait(false);
                return;
            }

            string query = string.Join(" ", args);
            string reply = await _aiService.ChatAsync(message.Author.Id, query).ConfigureAwait(false);

            EmbedBuilder embed = new()
            {
                Title = "🤖 AI Response",
                Description = reply,
                Color = new Color(0x1E90FF)
            };
            embed.WithFooter($"Requested by {message.Author.Username}");
            embed.WithCurrentTimestamp();

            await message.Channel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
        }
    }
}
