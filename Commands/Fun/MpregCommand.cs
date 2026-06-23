using Discord;
using Discord.WebSocket;
using ShiggyBot.Utils;
using SkiaSharp;
using Svg.Skia;

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

        private static string SvgPath => Path.Combine(AppContext.BaseDirectory, "assets", "mpreg.svg");

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
            using SKSvg svg = new();
            SKPicture? picture = svg.Load(SvgPath);

            _ = picture ?? throw new InvalidOperationException("SVG parsing returned null picture.");

            float scale = OutputSize / SvgViewBox;
            float headX = HeadCx * scale;
            float headY = HeadCy * scale;
            float headR = HeadR * scale;

            using SKBitmap bitmap = new(OutputSize, OutputSize);
            using SKCanvas canvas = new(bitmap);
            canvas.Clear(SKColors.Transparent);

            canvas.Save();
            canvas.Scale(scale, scale);
            canvas.DrawPicture(picture);
            canvas.Restore();

            using SKBitmap? avatarBitmap = SKBitmap.Decode(avatarData);
            if (avatarBitmap is not null)
            {
                float circleSize = headR * 2;
                using SKBitmap circularAvatar = new((int)circleSize, (int)circleSize);
                using SKCanvas avatarCanvas = new(circularAvatar);
                avatarCanvas.Clear(SKColors.Transparent);

                using SKPath clipPath = new();
                clipPath.AddCircle(headR, headR, headR);
                avatarCanvas.ClipPath(clipPath, antialias: true);

                using SKPaint paint = new() { IsAntialias = true };
                float srcSize = Math.Min(avatarBitmap.Width, avatarBitmap.Height);
                float sx = (avatarBitmap.Width - srcSize) / 2f;
                float sy = (avatarBitmap.Height - srcSize) / 2f;
                SKRect srcRect = new(sx, sy, sx + srcSize, sy + srcSize);
                SKRect destRect = new(0, 0, circleSize, circleSize);
                avatarCanvas.DrawBitmap(avatarBitmap, srcRect, destRect, paint);

                canvas.DrawBitmap(circularAvatar, headX - headR, headY - headR);
            }

            using SKImage image = SKImage.FromBitmap(bitmap);
            using SKData data = image.Encode(SKEncodedImageFormat.Png, 100);
            using FileStream stream = File.OpenWrite(outputPath);
            data.SaveTo(stream);
        }

        private static Color GetAverageColor(byte[] imageData)
        {
            using SKBitmap? bitmap = SKBitmap.Decode(imageData);
            if (bitmap is null)
            {
                return new Color(0xE91E63);
            }

            long totalR = 0, totalG = 0, totalB = 0;
            int count = 0;
            int step = Math.Max(1, Math.Min(bitmap.Width, bitmap.Height) / 32);

            for (int y = 0; y < bitmap.Height; y += step)
            {
                for (int x = 0; x < bitmap.Width; x += step)
                {
                    SKColor pixel = bitmap.GetPixel(x, y);
                    totalR += pixel.Red;
                    totalG += pixel.Green;
                    totalB += pixel.Blue;
                    count++;
                }
            }

            if (count == 0)
            {
                return new Color(0xE91E63);
            }

            byte r = (byte)(totalR / count);
            byte g = (byte)(totalG / count);
            byte b = (byte)(totalB / count);

            return new Color(r, g, b);
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
