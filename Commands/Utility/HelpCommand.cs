using Discord;
using Discord.WebSocket;
using ShiggyBot.Services;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to show available commands with an interactive menu.
    /// </summary>
    internal sealed class HelpCommand : ICommand
    {
        private readonly CommandHandler _commandHandler;

        internal HelpCommand(CommandHandler commandHandler)
        {
            _commandHandler = commandHandler;
        }

        /// <summary>Gets the command name.</summary>
        public string Name => "help";

        /// <summary>Gets the command description.</summary>
        public string Description => "Show all available commands with interactive menu";

        /// <summary>Gets the command category.</summary>
        public string Category => "Utility";

        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => [];

        /// <summary>Executes the command.</summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            string prefix = _commandHandler.Prefix;
            Dictionary<string, List<ICommand>> categories = _commandHandler.GetCommandsByCategory();

            if (args.Length > 0)
            {
                string cmdName = args[0].ToUpperInvariant();
                ICommand? command = _commandHandler.GetCommandByName(cmdName);
                if (command != null)
                {
                    await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildCommandHelpEmbed(command, prefix)).ConfigureAwait(false);
                    return;
                }
            }

            Embed embed = EmbedHelper.BuildMainHelpEmbed(categories, prefix);
            MessageComponent components = BuildSelectMenu(categories);

            await message.Channel.SendMessageAsync(embed: embed, components: components).ConfigureAwait(false);
        }

        private static MessageComponent BuildSelectMenu(Dictionary<string, List<ICommand>> categories)
        {
            SelectMenuBuilder menu = new()
            {
                CustomId = "help_category_select",
                Placeholder = "Select a category...",
                MinValues = 1,
                MaxValues = 1
            };

            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                string emoji = EmbedHelper.GetCategoryEmoji(category.Key);
                string keyUpper = category.Key.ToUpperInvariant();
                menu.AddOption(category.Key, keyUpper, $"View {keyUpper} commands", new Emoji(emoji));
            }

            return new ComponentBuilder()
                .WithSelectMenu(menu)
                .Build();
        }
    }
}
