using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class NukeCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal NukeCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "nuke";

        public string Description => "Clone and delete a channel to remove all messages (Administrator only)";

        public string Category => "Moderation";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);

            if (!await PermissionHelper.RequirePermissionAsync(message, GuildPermission.Administrator).ConfigureAwait(false))
            {
                return;
            }

            if (message.Channel is not SocketGuildChannel guildChannel)
            {
                return;
            }

            if (args.Length > 0 && args[0].Equals("confirm", StringComparison.OrdinalIgnoreCase))
            {
                string reason = args.Length > 1 ? string.Join(" ", args, 1, args.Length - 1) : "None";
                await NukeChannelAsync(guildChannel, message, reason).ConfigureAwait(false);
                return;
            }

            string? reasonHint = args.Length > 0 ? string.Join(" ", args) : null;

            V1MessageBuilder confirmBuilder = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("⚠️ Nuke Channel")
                    .WithDescription($"Are you sure you want to nuke #{guildChannel.Name}? This will delete ALL messages and recreate the channel.")
                    .WithColor(0xFFA500)
                    .AddField("Channel", $"#{guildChannel.Name}", true)
                    .AddField("Reason", reasonHint ?? "None", true)
                    .AddField("To confirm", $"`Snuke confirm{(reasonHint != null ? " " + reasonHint : "")}`", false)
                    .WithFooter("This action cannot be undone!"));

            await _v1Client.SendMessageAsync(message.Channel.Id, confirmBuilder).ConfigureAwait(false);
        }

        private async Task NukeChannelAsync(SocketGuildChannel channel, SocketUserMessage message, string reason)
        {
            if (channel is not ITextChannel textChannel)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Can only nuke text channels.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
                return;
            }

            SocketGuild guild = channel.Guild;

            try
            {
                ITextChannel newChannel = await guild.CreateTextChannelAsync(channel.Name, properties =>
                {
                    properties.Topic = textChannel.Topic;
                    properties.Position = channel.Position;
                    properties.CategoryId = textChannel.CategoryId;
                    properties.IsNsfw = textChannel.IsNsfw;
                }).ConfigureAwait(false);

                await newChannel.ModifyAsync(properties =>
                {
                    properties.SlowModeInterval = textChannel.SlowModeInterval;
                }).ConfigureAwait(false);

                IGuild iguild = guild;
                foreach (Overwrite overwrite in channel.PermissionOverwrites)
                {
                    if (overwrite.TargetType == PermissionTarget.Role)
                    {
                        IRole? role = await iguild.GetRoleAsync(overwrite.TargetId).ConfigureAwait(false);
                        if (role != null)
                        {
                            await newChannel.AddPermissionOverwriteAsync(role, overwrite.Permissions).ConfigureAwait(false);
                        }
                    }
                    else
                    {
                        IUser? user = await iguild.GetUserAsync(overwrite.TargetId).ConfigureAwait(false);
                        if (user != null)
                        {
                            await newChannel.AddPermissionOverwriteAsync(user, overwrite.Permissions).ConfigureAwait(false);
                        }
                    }
                }

                await channel.DeleteAsync().ConfigureAwait(false);

                V1MessageBuilder nukeBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("💥 Channel Nuked!")
                        .WithDescription($"This channel has been reset!\n**Reason:** {reason}\n**Moderator:** {message.Author.Mention}")
                        .WithColor(0x00FF00)
                        .WithTimestamp(DateTimeOffset.UtcNow));

                await _v1Client.SendMessageAsync(newChannel.Id, nukeBuilder).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Failed to nuke channel. Check bot permissions.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
            }
        }
    }
}
