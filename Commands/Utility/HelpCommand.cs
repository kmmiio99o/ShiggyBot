using Discord.WebSocket;
using ShiggyBot.Components.V2;
using ShiggyBot.Services;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to show available commands with an interactive menu.
    /// </summary>
    internal sealed class HelpCommand : ICommand
    {
        private static readonly Uri BotGifUrl = new("https://cdn.kmmiio99o.dev/shiggycord/l4exhy.gif");

        private readonly CommandHandler _commandHandler;
        private readonly ComponentsV2Client _v2Client;

        /// <summary>
        /// Initializes a new instance of the <see cref="HelpCommand"/> class.
        /// </summary>
        /// <param name="commandHandler">The command handler.</param>
        /// <param name="v2Client">The Components V2 client.</param>
        internal HelpCommand(CommandHandler commandHandler, ComponentsV2Client v2Client)
        {
            ArgumentNullException.ThrowIfNull(commandHandler);
            ArgumentNullException.ThrowIfNull(v2Client);
            _commandHandler = commandHandler;
            _v2Client = v2Client;
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
                if (command is not null)
                {
                    V2MessageBuilder builder = BuildCommandDetailPayload(command, prefix);
                    await _v2Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
                    return;
                }
            }

            V2MessageBuilder mainBuilder = BuildMainHelpPayload(categories, prefix);
            await _v2Client.SendMessageAsync(message.Channel.Id, mainBuilder).ConfigureAwait(false);
        }

        /// <summary>Builds the main help page payload with select menu and bot GIF.</summary>
        private static V2MessageBuilder BuildMainHelpPayload(Dictionary<string, List<ICommand>> categories, string prefix)
        {
            int totalCommands = categories.Values.Sum(c => c.Count);

            ContainerBuilder container = new ContainerBuilder()
                .WithAccentColor(0x9B59B6)
                .AddComponent(new SectionBuilder()
                    .AddTextDisplay(new TextDisplayBuilder().WithContent("# \U0001f916 ShiggyBot Help\n\n**Prefix:** `" + prefix + "`\nSelect a category below to view commands"))
                    .WithThumbnailAccessory(new ThumbnailBuilder()
                        .WithMedia(BotGifUrl)
                        .WithDescription("Bot GIF")))
                .AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small))
                .AddComponent(new TextDisplayBuilder().WithContent("## \U0001f4cb Categories"));

            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                string emoji = GetCategoryEmoji(category.Key);
                container.AddComponent(new TextDisplayBuilder().WithContent(
                    emoji + " **" + category.Key + "** (" + category.Value.Count + ")"));
            }

            container.AddComponent(new SeparatorBuilder().WithSpacing(SeparatorSpacing.Small));
            container.AddComponent(new TextDisplayBuilder().WithContent(
                "Use `" + prefix + "help <command>` for details on a specific command\nTotal: " + totalCommands + " command(s)"));

            return new V2MessageBuilder()
                .AddComponent(container)
                .AddComponent(BuildCategorySelectMenu(categories));
        }

        /// <summary>Builds the category help payload (for select menu navigation).</summary>
        internal static V2MessageBuilder BuildCategoryHelpPayload(string category, List<ICommand> commands, string prefix, Dictionary<string, List<ICommand>> allCategories)
        {
            int accentColor = GetCategoryColorInt(category);
            string emoji = GetCategoryEmoji(category);

            ContainerBuilder container = new ContainerBuilder()
                .WithAccentColor(accentColor)
                .AddComponent(new TextDisplayBuilder().WithContent("# " + emoji + " " + category + " Commands\n\nPrefix: `" + prefix + "`"));

            foreach (ICommand cmd in commands)
            {
                string aliases = cmd.Aliases?.Count > 0 ? " (Aliases: " + string.Join(", ", cmd.Aliases) + ")" : "";
                container.AddComponent(new TextDisplayBuilder().WithContent(
                    "**" + prefix + cmd.Name + "**" + aliases + "\n" + (cmd.Description ?? "No description")));
            }

            return new V2MessageBuilder()
                .AddComponent(container)
                .AddComponent(BuildCategorySelectMenu(allCategories));
        }

        /// <summary>Builds the per-command detail payload.</summary>
        private static V2MessageBuilder BuildCommandDetailPayload(ICommand command, string prefix)
        {
            int accentColor = GetCategoryColorInt(command.Category ?? "Other");
            string emoji = GetCategoryEmoji(command.Category ?? "Other");

            ContainerBuilder container = new ContainerBuilder()
                .WithAccentColor(accentColor)
                .AddComponent(new TextDisplayBuilder().WithContent("# Command: " + command.Name + "\n\n" + (command.Description ?? "No description")))
                .AddComponent(new TextDisplayBuilder().WithContent(
                    emoji + " **Category:** " + (command.Category ?? "Other") + "\n\u2139\ufe0f **Usage:** `" + prefix + command.Name + "`"));

            if (command.Aliases?.Count > 0)
            {
                container.AddComponent(new TextDisplayBuilder().WithContent(
                    "\U0001f517 **Aliases:** " + string.Join(", ", command.Aliases.Select(a => "`" + a + "`"))));
            }

            return new V2MessageBuilder()
                .AddComponent(container);
        }

        /// <summary>Builds a V1 action row with a select menu for category navigation.</summary>
        private static ActionRowBuilder BuildCategorySelectMenu(Dictionary<string, List<ICommand>> categories)
        {
            SelectMenuBuilder menu = new SelectMenuBuilder()
                .WithCustomId("help_category_select")
                .WithPlaceholder("Select a category...");

            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                menu.AddOption(category.Key, category.Key.ToUpperInvariant(),
                    "View " + category.Key.ToUpperInvariant() + " commands",
                    GetCategoryEmoji(category.Key));
            }

            return new ActionRowBuilder().AddComponent(menu);
        }

        private static string GetCategoryEmoji(string category)
        {
            return category.ToUpperInvariant() switch
            {
                "UTILITY" => "\U0001f527",
                "MODERATION" => "\U0001f6e1\ufe0f",
                "SEARCH" => "\U0001f50d",
                "FUN" => "\U0001f3ae",
                _ => "\U0001f4c1"
            };
        }

        private static int GetCategoryColorInt(string category)
        {
            return category.ToUpperInvariant() switch
            {
                "UTILITY" => 0x1E90FF,
                "MODERATION" => 0xFFA500,
                "SEARCH" => 0x00FF00,
                "FUN" => 0xE91E63,
                _ => 0x95A5A6
            };
        }
    }
}
