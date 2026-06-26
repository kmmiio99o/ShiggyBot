using Discord.Rest;
using Discord.WebSocket;
using ShiggyBot.Components.V1;

namespace ShiggyBot.Commands.Core
{
    internal sealed class V1TestCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal V1TestCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "v1";

        public string Description => "Test Discord V1 message format (buttons, embeds, etc.)";

        public string Category => "Core";

        public IReadOnlyList<string> Aliases => [];

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(args);
            ArgumentNullException.ThrowIfNull(client);

            RestApplication application = await client.GetApplicationInfoAsync().ConfigureAwait(false);
            if (message.Author.Id != application.Owner.Id)
            {
                return;
            }

            V1MessageBuilder builder = new V1MessageBuilder()
                .WithContent("Hello from **ShiggyBot** V1 components!")
                .AddEmbed(new V1EmbedBuilder()
                    .WithTitle("Test Embed")
                    .WithDescription("This embed was sent via the V1 REST API client.")
                    .WithColor(0x57F287)
                    .WithImage("https://cdn.discordapp.com/embed/avatars/0.png")
                    .AddField("Field 1", "Value 1", true)
                    .AddField("Field 2", "Value 2", true)
                    .WithFooter("ShiggyBot V1 Test")
                    .WithTimestamp(DateTimeOffset.UtcNow))
                .AddComponent(new V1ActionRowBuilder()
                    .AddComponent(new V1ButtonBuilder()
                        .WithStyle(ButtonStyle.Primary)
                        .WithLabel("Click me")
                        .WithCustomId("v1_test_primary"))
                    .AddComponent(new V1ButtonBuilder()
                        .WithStyle(ButtonStyle.Success)
                        .WithLabel("Success")
                        .WithCustomId("v1_test_success"))
                    .AddComponent(new V1ButtonBuilder()
                        .WithStyle(ButtonStyle.Link)
                        .WithLabel("GitHub")
                        .WithUrl("https://github.com/kmmiio99o/ShiggyBot")));

            await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
        }
    }
}
