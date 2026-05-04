using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using Discord.Rest;
using ShiggyBot.Commands;
using ShiggyBot.Services;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Utility
{
    public class HelpCommand : ICommand
    {
        private readonly CommandHandler _commandHandler;

        public HelpCommand(CommandHandler commandHandler)
        {
            _commandHandler = commandHandler;
        }

        public string Name => "help";
        public string Description => "Show all available commands with interactive menu";
        public string Category => "Utility";
        public string[] Aliases => new[] { "commands" };

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            var prefix = _commandHandler.Prefix;
            var categories = _commandHandler.GetCommandsByCategory();

            if (args.Length > 0)
            {
                var cmdName = args[0].ToLower();
                var command = _commandHandler.GetCommandByName(cmdName);
                if (command != null)
                {
                    await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildCommandHelpEmbed(command, prefix));
                    return;
                }
            }

            var embed = EmbedHelper.BuildMainHelpEmbed(categories, prefix);
            var components = BuildSelectMenu(categories);

            await message.Channel.SendMessageAsync(embed: embed, components: components);
        }

        private MessageComponent BuildSelectMenu(Dictionary<string, List<ICommand>> categories)
        {
            var menu = new SelectMenuBuilder
            {
                CustomId = "help_category_select",
                Placeholder = "Select a category...",
                MinValues = 1,
                MaxValues = 1
            };

            foreach (var category in categories)
            {
                var emoji = EmbedHelper.GetCategoryEmoji(category.Key);
                menu.AddOption(category.Key, category.Key.ToLower(), $"View {category.Key.ToLower()} commands", new Emoji(emoji));
            }

            return new ComponentBuilder()
                .WithSelectMenu(menu)
                .Build();
        }
    }
}
