using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Utility
{
    /// <summary>
    /// Command to access saved notes and information.
    /// </summary>
    internal sealed class NoteCommand : ICommand
    {
        /// <summary>Gets the command name.</summary>
        public string Name => "note";

        /// <summary>Gets the command description.</summary>
        public string Description => "Access saved notes and information";

        /// <summary>Gets the command category.</summary>
        public string Category => "Utility";

        /// <summary>Gets the command aliases.</summary>
        public IReadOnlyList<string> Aliases => [];

        private static readonly Dictionary<string, string> Notes = new()
        {
      { "vc", "No one can hear me\n\nDisable Advanced Voice Activity in Voice settings of Discord, and reload the app." },
      { "install", "Installation links\n\nShiggyCord: https://github.com/kmmiio99o/ShiggyCord\nShiggyManager: https://github.com/kmmiio99o/ShiggyManager\nShiggyXposed: https://github.com/kmmiio99o/ShiggyXposed" },
      { "background", "Background in themes not showing\n\nDue to a recent Discord change, the themes chat background is currently broken for some users. The devs want to fix it but haven't been able to recreate the problem themselves yet." },
      { "ios", "iOS Support\n\nDoes ShiggyCord support iOS? No, but you can run it as a custom bundle by KettuTweak." },
      { "passkeys", "Passkeys not working\n\nDue to the way ShiggyCord modifies the Discord app, it breaks the functionality of passkeys. To use passkeys, you must instead use ShiggyXposed, which doesn't alter the original app. Please note that ShiggyXposed requires a rooted device." },
      { "ftf", "Failed to fetch\n\nShiggyCord tried to fetch bundle but couldn't. Try using vpn and see if it works. But if Shiggy still load successfully, ignore it." },
      { "stuck", "ShiggyCord stuck on loading discord screen\n\nDisable bundle injection in Xposed Recovery Menu (shake your phone). If it fixes the issue, enable it again." },
    };

        /// <summary>Executes the command.</summary>
        /// <param name="message">The message that triggered the command.</param>
        /// <param name="args">The command arguments.</param>
        /// <param name="client">The Discord client instance.</param>
        public Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (args.Length > 0 && Notes.TryGetValue(args[0], out string? v))
            {
                string[] lines = v.Split('\n', 2, StringSplitOptions.TrimEntries);
                string title = lines[0];
                string description = lines.Length > 1 ? lines[1] : "";
                return message.Channel.SendMessageAsync(embed: EmbedHelper.BuildInfoEmbed(title, description));
            }

            EmbedBuilder embed = new()
            {
                Title = "Available Notes",
                Description = "Use `Snote <name>` to view a note\n\n" + string.Join(", ", Notes.Keys),
                Color = new Color(0x1E90FF)
            };

            return message.Channel.SendMessageAsync(embed: embed.Build());
        }
    }
}
