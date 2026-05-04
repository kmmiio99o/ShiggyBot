using Discord;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using ShiggyBot.Commands;

namespace ShiggyBot.Utils
{
    public static class EmbedHelper
    {
        public static ulong? ParseUserMention(string arg)
        {
            var match = Regex.Match(arg, @"^<@!?(\d+)>$");
            return match.Success ? ulong.Parse(match.Groups[1].Value) : null;
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
            var builder = new EmbedBuilder
            {
                Title = "Available Commands",
                Description = $"Prefix: {prefix}",
                Color = new Color(0x1E90FF)
            };
            foreach (var cmd in commands)
            {
                builder.AddField(cmd.Name, cmd.Description, inline: false);
            }
            return builder.Build();
        }

        public static Embed BuildCategoryHelpEmbed(string category, List<ICommand> commands, string prefix)
        {
            var builder = new EmbedBuilder
            {
                Title = $"📁 {category} Commands",
                Description = $"Prefix: `{prefix}`\nUse `{prefix}help` to return to this menu",
                Color = GetCategoryColor(category)
            };

            foreach (var cmd in commands)
            {
                var aliases = cmd.Aliases?.Length > 0 ? $" (Aliases: {string.Join(", ", cmd.Aliases)})" : "";
                builder.AddField($"{prefix}{cmd.Name}{aliases}", cmd.Description ?? "No description", inline: false);
            }

            builder.Footer = new EmbedFooterBuilder
            {
                Text = $"Total: {commands.Count} command(s) in {category}"
            };

            return builder.Build();
        }

        public static Embed BuildMainHelpEmbed(Dictionary<string, List<ICommand>> categories, string prefix)
        {
            var builder = new EmbedBuilder
            {
                Title = "🤖 ShiggyBot Help",
                Description = $"**Prefix:** `{prefix}`\nSelect a category below to view commands",
                Color = new Color(0x9B59B6)
            };

            foreach (var category in categories)
            {
                var emoji = GetCategoryEmoji(category.Key);
                builder.AddField($"{emoji} {category.Key} ({category.Value.Count})",
                    $"Use the select menu below to view {category.Key.ToLower()} commands",
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
            var builder = new EmbedBuilder
            {
                Title = $"Command: {command.Name}",
                Description = command.Description ?? "No description",
                Color = new Color(0x1E90FF)
            };

            builder.AddField("Category", command.Category ?? "Other", inline: true);
            builder.AddField("Usage", $"`{prefix}{command.Name}`", inline: true);

            if (command.Aliases?.Length > 0)
            {
                builder.AddField("Aliases", string.Join(", ", command.Aliases.Select(a => $"`{a}`")), inline: false);
            }

            return builder.Build();
        }

        private static Color GetCategoryColor(string category)
        {
            return category.ToLower() switch
            {
                "utility" => new Color(0x1E90FF),
                "moderation" => new Color(0xFFA500),
                "search" => new Color(0x00FF00),
                _ => new Color(0x95A5A6)
            };
        }

        public static string GetCategoryEmoji(string category)
        {
            return category.ToLower() switch
            {
                "utility" => "🔧",
                "moderation" => "🛡️",
                "search" => "🔍",
                _ => "📁"
            };
        }
    }
}
