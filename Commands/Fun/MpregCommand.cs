using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using Color = Discord.Color;
using Image = SixLabors.ImageSharp.Image;

namespace ShiggyBot.Commands.Fun
{
    internal sealed class MpregCommand : ICommand
    {
        public string Name => "mpreg";

        public string Description => "Generate a pregnant man image with a user's avatar on the head";

        public string Category => "Fun";

        public IReadOnlyList<string> Aliases => [];

        private const int OutputSize = 512;

        private const float SvgViewBox = 36f;

        private const float HeadCx = 17f;

        private const float HeadCy = 8.2f;

        private const float HeadR = 8f;

        private static string BasePngPath => Path.Combine(AppContext.BaseDirectory, "assets", "mpreg.png");

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(client);

            if (args.Length == 0)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Usage: `Smpreg <username | userid | @mention>`")).ConfigureAwait(false);
                return;
            }

            IUser? target = await ResolveUser(args[0], message, client).ConfigureAwait(false);
            if (target is null)
            {
                await message.Channel.SendMessageAsync(embed: EmbedHelper.BuildErrorEmbed("Could not find that user.")).ConfigureAwait(false);
                return;
            }

            string avatarUrl = target.GetAvatarUrl(ImageFormat.Png, 256)
                ?? target.GetDefaultAvatarUrl();

            using HttpClient http = new();
            byte[] avatarData = await http.GetByteArrayAsync(new Uri(avatarUrl)).ConfigureAwait(false);

            string fileName = $"mpreg_{target.Id}.png";
            string filePath = Path.Combine(Path.GetTempPath(), fileName);

            GenerateMpregImage(avatarData, filePath);

            Color embedColor = GetAverageColor(avatarData);

            Embed embed = new EmbedBuilder()
                .WithImageUrl($"attachment://{fileName}")
                .WithAuthor(target)
                .WithFooter($"Requested by {message.Author.GlobalName ?? message.Author.Username}")
                .WithColor(embedColor)
                .Build();

            using FileStream stream = File.OpenRead(filePath);
            await message.Channel.SendFileAsync(stream, fileName, embed: embed).ConfigureAwait(false);

            try
            {
                File.Delete(filePath);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        private static void GenerateMpregImage(byte[] avatarData, string outputPath)
        {
            try
            {
                GenerateMpregImageCore(avatarData, outputPath);
            }
            catch (InvalidOperationException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Image generation failed.", ex);
            }
        }

        private static void GenerateMpregImageCore(byte[] avatarData, string outputPath)
        {
            using Image<Rgba32> baseImage = Image.Load<Rgba32>(BasePngPath);

            float scale = OutputSize / SvgViewBox;
            float headX = HeadCx * scale;
            float headY = HeadCy * scale;
            float headRadius = HeadR * scale;
            float circleDiameter = headRadius * 2;

            using Image<Rgba32> avatar = Image.Load<Rgba32>(avatarData);

            int minSide = Math.Min(avatar.Width, avatar.Height);
            int cropX = (avatar.Width - minSide) / 2;
            int cropY = (avatar.Height - minSide) / 2;
            avatar.Mutate(ctx => ctx.Crop(new Rectangle(cropX, cropY, minSide, minSide)));
            avatar.Mutate(ctx => ctx.Resize((int)circleDiameter, (int)circleDiameter));

            int circlePixels = (int)circleDiameter;
            float r = circleDiameter / 2f;
            float cx = r;
            float cy = r;
            for (int y = 0; y < circlePixels; y++)
            {
                for (int x = 0; x < circlePixels; x++)
                {
                    float dx = x - cx + 0.5f;
                    float dy = y - cy + 0.5f;
                    if ((dx * dx) + (dy * dy) > r * r)
                    {
                        avatar[x, y] = new Rgba32(0, 0, 0, 0);
                    }
                }
            }

            baseImage.Mutate(ctx => ctx.DrawImage(avatar, new Point((int)(headX - headRadius), (int)(headY - headRadius)), 1f));

            baseImage.Save(outputPath);
        }

        private static Color GetAverageColor(byte[] imageData)
        {
            try
            {
                using Image<Rgba32> avatar = Image.Load<Rgba32>(imageData);

                long totalR = 0, totalG = 0, totalB = 0;
                int count = 0;
                int step = Math.Max(1, Math.Min(avatar.Width, avatar.Height) / 32);

                for (int y = 0; y < avatar.Height; y += step)
                {
                    for (int x = 0; x < avatar.Width; x += step)
                    {
                        Rgba32 pixel = avatar[x, y];
                        totalR += pixel.R;
                        totalG += pixel.G;
                        totalB += pixel.B;
                        count++;
                    }
                }

                return count == 0
                    ? new Color(0xE91E63)
                    : new Color((byte)(totalR / count), (byte)(totalG / count), (byte)(totalB / count));
            }
#pragma warning disable CA1031 // fallback to pink on any error
            catch
#pragma warning restore CA1031
            {
                return new Color(0xE91E63);
            }
        }

        private static async Task<IUser?> ResolveUser(string input, SocketUserMessage message, DiscordSocketClient client)
        {
            if (message.MentionedUsers.Count > 0)
            {
                return message.MentionedUsers.First();
            }

            if (ulong.TryParse(input, out ulong id))
            {
                IUser? user = await client.Rest.GetUserAsync(id).ConfigureAwait(false);
                if (user is not null)
                {
                    return user;
                }
            }

            if (message.Channel is SocketGuildChannel guildChannel)
            {
                SocketGuild guild = guildChannel.Guild;
                SocketGuildUser? match = guild.Users.FirstOrDefault(u =>
                    u.Username.Equals(input, StringComparison.OrdinalIgnoreCase) ||
                    (u.GlobalName?.Equals(input, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (u.Nickname?.Equals(input, StringComparison.OrdinalIgnoreCase) ?? false));
                if (match is not null)
                {
                    return match;
                }
            }

            return null;
        }
    }
}
