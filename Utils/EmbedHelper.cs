using Discord;
using System.Globalization;
using System.Text.RegularExpressions;
using ShiggyBot.Commands;

namespace ShiggyBot.Utils
{
    internal static partial class EmbedHelper
    {
        [GeneratedRegex(@"^<@!?(\d+)>$", RegexOptions.Compiled)]
        private static partial Regex UserMentionRegex();

        public static ulong? ParseUserMention(string arg)
        {
            Match match = UserMentionRegex().Match(arg);
            return match.Success ? ulong.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : null;
        }

        public static Embed BuildPingEmbed(int latency)
        {
            return new EmbedBuilder
            {
                Title = "Pong",
                Description = $"Latency: {latency} ms",
                Color = new Color(0x00FF00) // green
            }.Build();
        }

        public static Embed BuildModerationEmbed(string action, string target, string reason, string moderator)
        {
            return new EmbedBuilder
            {
                Title = $"Moderation: {action}",
                Description = $"**Target:** {target}\n**Reason:** {reason}\n**Moderator:** {moderator}",
                Color = new Color(0xFFA500) // orange
            }.Build();
        }

        public static Embed BuildErrorEmbed(string error)
        {
            return new EmbedBuilder
            {
                Title = "Error",
                Description = error,
                Color = new Color(0xFF0000) // red
            }.Build();
        }

        public static Embed BuildInfoEmbed(string title, string description)
        {
            return new EmbedBuilder
            {
                Title = title,
                Description = description,
                Color = new Color(0x1E90FF) // blue
            }.Build();
        }

        public static Embed BuildSuccessEmbed(string description)
        {
            return new EmbedBuilder
            {
                Title = "Success",
                Description = description,
                Color = new Color(0x00FF00) // green
            }.Build();
        }

        public static Embed BuildHelpEmbed(List<(string Name, string Description)> commands, string prefix)
        {
            EmbedBuilder builder = new()
            {
                Title = "Available Commands",
                Description = $"Prefix: {prefix}",
                Color = new Color(0x1E90FF)
            };
            foreach ((string Name, string Description) in commands)
            {
                builder.AddField(Name, Description, inline: false);
            }
            return builder.Build();
        }

        public static Embed BuildCategoryHelpEmbed(string category, List<ICommand> commands, string prefix)
        {
            ArgumentNullException.ThrowIfNull(category);
            ArgumentNullException.ThrowIfNull(commands);
            EmbedBuilder builder = new()
            {
                Title = $"📁 {category} Commands",
                Description = $"Prefix: `{prefix}`\nUse `{prefix}help` to return to this menu",
                Color = GetCategoryColor(category)
            };

            foreach (ICommand cmd in commands)
            {
                string aliases = cmd.Aliases?.Length > 0 ? $" (Aliases: {string.Join(", ", cmd.Aliases)})" : "";
                _ = builder.AddField($"{prefix}{cmd.Name}{aliases}", cmd.Description ?? "No description", inline: false);
            }

            builder.Footer = new EmbedFooterBuilder
            {
                Text = $"Total: {commands.Count} command(s) in {category}"
            };

            return builder.Build();
        }

        public static Embed BuildMainHelpEmbed(Dictionary<string, List<ICommand>> categories, string prefix)
        {
            ArgumentNullException.ThrowIfNull(categories);
            EmbedBuilder builder = new()
            {
                Title = "🤖 ShiggyBot Help",
                Description = $"**Prefix:** `{prefix}`\nSelect a category below to view commands",
                Color = new Color(0x9B59B6)
            };

            foreach (KeyValuePair<string, List<ICommand>> category in categories)
            {
                string emoji = GetCategoryEmoji(category.Key);
                _ = builder.AddField($"{emoji} {category.Key} ({category.Value.Count})",
                    $"Use the select menu below to view {category.Key.ToUpperInvariant()} commands",
                    inline: false);
            }

            builder.Footer = new EmbedFooterBuilder
            {
                Text = $"Total: {categories.Values.Sum(c => c.Count)} command(s) | Use {prefix}help <command> for details"
            };

            return builder.Build();
        }

        public static Embed BuildCommandHelpEmbed(ICommand command, string prefix)
        {
            ArgumentNullException.ThrowIfNull(command);
            EmbedBuilder builder = new()
            {
                Title = $"Command: {command.Name}",
                Description = command.Description ?? "No description",
                Color = new Color(0x1E90FF)
            };

            _ = builder.AddField("Category", command.Category ?? "Other", inline: true);
            _ = builder.AddField("Usage", $"`{prefix}{command.Name}`", inline: true);

            if (command.Aliases?.Length > 0)
            {
                _ = builder.AddField("Aliases", string.Join(", ", command.Aliases.Select(a => $"`{a}`")), inline: false);
            }

            return builder.Build();
        }

        private static Color GetCategoryColor(string category)
        {
            ArgumentNullException.ThrowIfNull(category);
            return category.ToUpperInvariant() switch
            {
                "UTILITY" => new Color(0x1E90FF),
                "MODERATION" => new Color(0xFFA500),
                "SEARCH" => new Color(0x00FF00),
                _ => new Color(0x95A5A6)
            };
        }

        public static string GetCategoryEmoji(string category)
        {
            ArgumentNullException.ThrowIfNull(category);
            return category.ToUpperInvariant() switch
            {
                "UTILITY" => "🔧",
                "MODERATION" => "🛡️",
                "SEARCH" => "🔍",
                _ => "📁"
            };
        }
    }
}
