using System.Buffers;
using System.Text.Json;
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
        private const int IsComponentsV2Flag = 1 << 15;
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
                    byte[] payload = BuildCommandDetailPayload(command, prefix);
                    await _v2Client.SendRawPayloadAsync(message.Channel.Id, payload).ConfigureAwait(false);
                    return;
                }
            }

            byte[] mainPayload = BuildMainHelpPayload(categories, prefix);
            await _v2Client.SendRawPayloadAsync(message.Channel.Id, mainPayload).ConfigureAwait(false);
        }

        /// <summary>Builds the main help page payload with select menu and bot GIF.</summary>
        private static byte[] BuildMainHelpPayload(Dictionary<string, List<ICommand>> categories, string prefix)
        {
            int totalCommands = categories.Values.Sum(c => c.Count);

            ArrayBufferWriter<byte> buffer = new();
            using Utf8JsonWriter writer = new(buffer);

            writer.WriteStartObject();
            writer.WriteNumber("flags", IsComponentsV2Flag);
            writer.WriteStartArray("components");

            writer.WriteStartObject();
            writer.WriteNumber("type", 17);
            writer.WriteNumber("accent_color", 0x9B59B6);
            writer.WriteStartArray("components");

            WriteSectionWithThumbnail(writer, "# \U0001f916 ShiggyBot Help",
                "**Prefix:** `" + prefix + "`\nSelect a category below to view commands");

            WriteSeparator(writer, SeparatorSpacing.Small);

            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            writer.WriteString("content", "## \U0001f4cb Categories");
            writer.WriteEndObject();

            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                string emoji = GetCategoryEmoji(category.Key);
                writer.WriteStartObject();
                writer.WriteNumber("type", 10);
                writer.WriteString("content", emoji + " **" + category.Key + "** (" + category.Value.Count + ")");
                writer.WriteEndObject();
            }

            WriteSeparator(writer, SeparatorSpacing.Small);

            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            writer.WriteString("content", "Use `" + prefix + "help <command>` for details on a specific command\nTotal: " + totalCommands + " command(s)");
            writer.WriteEndObject();

            writer.WriteEndArray();
            writer.WriteEndObject();

            WriteSelectMenu(writer, categories);

            writer.WriteEndArray();
            writer.WriteEndObject();
            writer.Flush();

            return buffer.WrittenSpan.ToArray();
        }

        /// <summary>Builds the category help payload (for select menu navigation).</summary>
        internal static byte[] BuildCategoryHelpPayload(string category, List<ICommand> commands, string prefix, Dictionary<string, List<ICommand>> allCategories)
        {
            int accentColor = GetCategoryColorInt(category);

            ArrayBufferWriter<byte> buffer = new();
            using Utf8JsonWriter writer = new(buffer);

            writer.WriteStartObject();
            writer.WriteNumber("flags", IsComponentsV2Flag);
            writer.WriteStartArray("components");

            writer.WriteStartObject();
            writer.WriteNumber("type", 17);
            writer.WriteNumber("accent_color", accentColor);
            writer.WriteStartArray("components");

            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            string emoji = GetCategoryEmoji(category);
            writer.WriteString("content", "# " + emoji + " " + category + " Commands\n\nPrefix: `" + prefix + "`");
            writer.WriteEndObject();

            foreach (ICommand cmd in commands)
            {
                string aliases = cmd.Aliases?.Count > 0 ? " (Aliases: " + string.Join(", ", cmd.Aliases) + ")" : "";
                writer.WriteStartObject();
                writer.WriteNumber("type", 10);
                writer.WriteString("content", "**" + prefix + cmd.Name + "**" + aliases + "\n" + (cmd.Description ?? "No description"));
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();

            WriteSelectMenu(writer, allCategories);

            writer.WriteEndArray();
            writer.WriteEndObject();
            writer.Flush();

            return buffer.WrittenSpan.ToArray();
        }

        /// <summary>Builds the per-command detail payload.</summary>
        private static byte[] BuildCommandDetailPayload(ICommand command, string prefix)
        {
            int accentColor = GetCategoryColorInt(command.Category ?? "Other");

            ArrayBufferWriter<byte> buffer = new();
            using Utf8JsonWriter writer = new(buffer);

            writer.WriteStartObject();
            writer.WriteNumber("flags", IsComponentsV2Flag);
            writer.WriteStartArray("components");

            writer.WriteStartObject();
            writer.WriteNumber("type", 17);
            writer.WriteNumber("accent_color", accentColor);
            writer.WriteStartArray("components");

            string emoji = GetCategoryEmoji(command.Category ?? "Other");
            string content = "# Command: " + command.Name + "\n\n" + (command.Description ?? "No description");
            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            writer.WriteString("content", content);
            writer.WriteEndObject();

            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            writer.WriteString("content", emoji + " **Category:** " + (command.Category ?? "Other") + "\n\u2139\ufe0f **Usage:** `" + prefix + command.Name + "`");
            writer.WriteEndObject();

            if (command.Aliases?.Count > 0)
            {
                writer.WriteStartObject();
                writer.WriteNumber("type", 10);
                writer.WriteString("content", "\U0001f517 **Aliases:** " + string.Join(", ", command.Aliases.Select(a => "`" + a + "`")));
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();

            writer.WriteEndArray();
            writer.WriteEndObject();
            writer.Flush();

            return buffer.WrittenSpan.ToArray();
        }

        /// <summary>Writes a V1 action row with a select menu for category navigation.</summary>
        private static void WriteSelectMenu(Utf8JsonWriter writer, Dictionary<string, List<ICommand>> categories)
        {
            writer.WriteStartObject();
            writer.WriteNumber("type", 1);
            writer.WriteStartArray("components");
            writer.WriteStartObject();
            writer.WriteNumber("type", 3);
            writer.WriteString("custom_id", "help_category_select");
            writer.WriteString("placeholder", "Select a category...");
            writer.WriteNumber("min_values", 1);
            writer.WriteNumber("max_values", 1);
            writer.WriteStartArray("options");
            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                writer.WriteStartObject();
                writer.WriteString("label", category.Key);
                writer.WriteString("value", category.Key.ToUpperInvariant());
                writer.WriteString("description", "View " + category.Key.ToUpperInvariant() + " commands");
                writer.WriteStartObject("emoji");
                writer.WriteString("name", GetCategoryEmoji(category.Key));
                writer.WriteEndObject();
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        /// <summary>Writes a V2 Section with a thumbnail accessory.</summary>
        private static void WriteSectionWithThumbnail(Utf8JsonWriter writer, string title, string description)
        {
            writer.WriteStartObject();
            writer.WriteNumber("type", 9);
            writer.WriteStartArray("components");
            writer.WriteStartObject();
            writer.WriteNumber("type", 10);
            writer.WriteString("content", title + "\n\n" + description);
            writer.WriteEndObject();
            writer.WriteEndArray();
            writer.WritePropertyName("accessory");
            writer.WriteStartObject();
            writer.WriteNumber("type", 11);
            writer.WriteStartObject("media");
            writer.WriteString("url", BotGifUrl.ToString());
            writer.WriteEndObject();
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        /// <summary>Writes a V2 Separator.</summary>
        private static void WriteSeparator(Utf8JsonWriter writer, SeparatorSpacing spacing)
        {
            writer.WriteStartObject();
            writer.WriteNumber("type", 14);
            writer.WriteNumber("spacing", (int)spacing);
            writer.WriteEndObject();
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
