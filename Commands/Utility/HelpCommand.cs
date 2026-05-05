using Discord;
using Discord.WebSocket;
using ShiggyBot.Services;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to show all available commands with interactive menu.
    /// </summary>
    internal sealed class HelpCommand(CommandHandler commandHandler) : ICommand
    {
        /// <summary>
        /// Gets the name of the command.
        /// </summary>
        public string Name => "help";

        /// <summary>
        /// Gets the description of the command.
        /// </summary>
        public string Description => "Show all available commands with interactive menu";

        /// <summary>
        /// Gets the category of the command.
        /// </summary>
        public string Category => "Utility";

        /// <summary>
        /// Gets the aliases for the command.
        /// </summary>
        public string[] Aliases => ["commands"];

        /// <summary>
        /// Executes the help command.
        /// </summary>
        /// <param name="message">The user message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            string prefix = commandHandler.Prefix;
            Dictionary<string, List<ICommand>> categories = commandHandler.GetCommandsByCategory();

            if (args.Length > 0)
            {
                string cmdName = args[0].ToUpperInvariant();
                ICommand? command = commandHandler.GetCommandByName(cmdName);
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
