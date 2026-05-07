using Discord;
using Discord.Rest;
using Discord.WebSocket;
using ShiggyBot.Utils;

namespace ShiggyBot.Commands.Moderation
{
    internal sealed class NukeCommand : ICommand
    {
        public string Name => "nuke";
        public string Description => "Clone and delete a channel to remove all messages (Administrator only)";
        public string Category => "Moderation";
        public string[] Aliases => ["channelnuke"];

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

            EmbedBuilder confirmEmbed = new()
            {
                Title = "⚠️ Nuke Channel",
                Description = $"Are you sure you want to nuke #{guildChannel.Name}? This will delete ALL messages and recreate the channel.",
                Color = new Color(0xFFA500)
            };
            confirmEmbed.AddField("Channel", $"#{guildChannel.Name}", inline: true);
            confirmEmbed.AddField("Reason", reasonHint ?? "None", inline: true);
            confirmEmbed.AddField("To confirm", $"`Snuke confirm{(reasonHint != null ? " " + reasonHint : "")}`", inline: false);
            confirmEmbed.WithFooter("This action cannot be undone!");
            RestUserMessage confirmation = await message.Channel.SendMessageAsync(embed: confirmEmbed.Build()).ConfigureAwait(false);
            _ = Task.Run(async () =>
            {
                await Task.Delay(5_000).ConfigureAwait(false);
                try { await confirmation.DeleteAsync().ConfigureAwait(false); }
                catch (HttpRequestException) { }
                catch (InvalidOperationException) { }
            });
        }

        private static async Task NukeChannelAsync(SocketGuildChannel channel, SocketUserMessage message, string reason)
        {
            if (channel is not ITextChannel textChannel)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Can only nuke text channels.")).ConfigureAwait(false);
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

                EmbedBuilder embed = new()
                {
                    Title = "💥 Channel Nuked!",
                    Description = $"This channel has been reset!\n**Reason:** {reason}\n**Moderator:** {message.Author.Mention}",
                    Color = new Color(0x00FF00)
                };
                embed.WithCurrentTimestamp();
                await newChannel.SendMessageAsync(embed: embed.Build()).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Failed to nuke channel. Check bot permissions.")).ConfigureAwait(false);
            }
        }
    }
}
