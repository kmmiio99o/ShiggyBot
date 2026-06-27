using System.Collections.Concurrent;
using Discord;
using Discord.WebSocket;
using ShiggyBot.Components.V1;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;
using Color = Discord.Color;
using Image = SixLabors.ImageSharp.Image;

namespace ShiggyBot.Commands.Fun
{
    internal sealed class MpregCommand : ICommand
    {
        private readonly ComponentsV1Client _v1Client;

        internal MpregCommand(ComponentsV1Client v1Client)
        {
            ArgumentNullException.ThrowIfNull(v1Client);
            _v1Client = v1Client;
        }

        public string Name => "mpreg";

        public string Description => "Generate a pregnant man image with a user's avatar on the head";

        public string Category => "Fun";

        public IReadOnlyList<string> Aliases => [];

        private const int OutputSize = 512;

        private const float SvgViewBox = 36f;

        private const float HeadCx = 17f;

        private const float HeadCy = 8.3f;

        private const float HeadR = 8f;

        private static readonly HttpClient _http = new();
        private static readonly string BasePngPath = Path.Combine(AppContext.BaseDirectory, "assets", "mpreg.png");
        private static readonly byte[] BaseImageBytes = File.ReadAllBytes(BasePngPath);
        private static readonly ConcurrentDictionary<string, string> ResultCache = new();
        private static readonly string CacheDir = Path.Combine(Path.GetTempPath(), "shiggybot_mpreg");

        public async Task ExecuteAsync(SocketUserMessage message, string[] args, DiscordSocketClient client)
        {
            ArgumentNullException.ThrowIfNull(message);
            ArgumentNullException.ThrowIfNull(client);

            if (args.Length == 0)
            {
                V1MessageBuilder usageBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Usage: `Smpreg <username | userid | @mention>`")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, usageBuilder).ConfigureAwait(false);
                return;
            }

            IUser? target = await ResolveUser(args[0], message, client).ConfigureAwait(false);
            if (target is null)
            {
                V1MessageBuilder errorBuilder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithTitle("Error")
                        .WithDescription("Could not find that user.")
                        .WithColor(0xFF0000));

                await _v1Client.SendMessageAsync(message.Channel.Id, errorBuilder).ConfigureAwait(false);
                return;
            }

            string avatarUrl = target.GetAvatarUrl(ImageFormat.Png, 256)
                ?? target.GetDefaultAvatarUrl();

            string cacheKey = $"{target.Id}:{avatarUrl}";
            string avatarHash = avatarUrl.Split('/').Last().Split('.').First().Split('?').First();
            string fileName = $"mpreg_{target.Id}_{avatarHash}.png";

            byte[] imageBytes;

            if (!ResultCache.TryGetValue(cacheKey, out string? cachedPath))
            {
                cachedPath = Path.Combine(CacheDir, fileName);
                if (File.Exists(cachedPath))
                {
                    ResultCache[cacheKey] = cachedPath;
                }
                else
                {
                    cachedPath = null;
                }
            }

            if (cachedPath is not null)
            {
                imageBytes = await File.ReadAllBytesAsync(cachedPath).ConfigureAwait(false);

                V1MessageBuilder builder = new V1MessageBuilder()
                    .AddEmbed(new V1EmbedBuilder()
                        .WithImage($"attachment://{fileName}")
                        .WithAuthor(target.GlobalName ?? target.Username, target.GetAvatarUrl() ?? target.GetDefaultAvatarUrl())
                        .WithFooter($"Requested by {message.Author.GlobalName ?? message.Author.Username}")
                        .WithColor(0xE91E63))
                    .AddAttachment(imageBytes, fileName);

                await _v1Client.SendMessageAsync(message.Channel.Id, builder).ConfigureAwait(false);
                return;
            }

            byte[] avatarData = await _http.GetByteArrayAsync(new Uri(avatarUrl)).ConfigureAwait(false);
            (Color embedColor, imageBytes) = GenerateMpregImage(avatarData);

            Directory.CreateDirectory(CacheDir);
            string filePath = Path.Combine(CacheDir, fileName);
            await File.WriteAllBytesAsync(filePath, imageBytes).ConfigureAwait(false);

            ResultCache[cacheKey] = filePath;

            V1MessageBuilder builder2 = new V1MessageBuilder()
                .AddEmbed(new V1EmbedBuilder()
                    .WithImage($"attachment://{fileName}")
                    .WithAuthor(target.GlobalName ?? target.Username, target.GetAvatarUrl() ?? target.GetDefaultAvatarUrl())
                    .WithFooter($"Requested by {message.Author.GlobalName ?? message.Author.Username}")
                    .WithColor((int)embedColor.RawValue))
                .AddAttachment(imageBytes, fileName);

            await _v1Client.SendMessageAsync(message.Channel.Id, builder2).ConfigureAwait(false);
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

        private static (Color, byte[]) GenerateMpregImage(byte[] avatarData)
        {
            try
            {
                using Image<Rgba32> baseImage = Image.Load<Rgba32>(BaseImageBytes);

                float scale = OutputSize / SvgViewBox;
                float headX = HeadCx * scale;
                float headY = HeadCy * scale;
                float headRadius = HeadR * scale;
                int circleDiameter = (int)(headRadius * 2);

                using Image<Rgba32> avatar = Image.Load<Rgba32>(avatarData);

                int minSide = Math.Min(avatar.Width, avatar.Height);
                int cropX = (avatar.Width - minSide) / 2;
                int cropY = (avatar.Height - minSide) / 2;

                avatar.Mutate(ctx =>
                {
                    ctx.Crop(new Rectangle(cropX, cropY, minSide, minSide));
                    ctx.Resize(circleDiameter, circleDiameter);
                });

                float radius = circleDiameter / 2f;
                float cx = radius;
                float cy = radius;
                long totalR = 0, totalG = 0, totalB = 0;
                int colorCount = 0;

                avatar.ProcessPixelRows(accessor =>
                {
                    for (int y = 0; y < accessor.Height; y++)
                    {
                        Span<Rgba32> row = accessor.GetRowSpan(y);
                        for (int x = 0; x < row.Length; x++)
                        {
                            float dx = x - cx + 0.5f;
                            float dy = y - cy + 0.5f;
                            if ((dx * dx) + (dy * dy) > radius * radius)
                            {
                                row[x] = new Rgba32(0, 0, 0, 0);
                            }
                            else
                            {
                                totalR += row[x].R;
                                totalG += row[x].G;
                                totalB += row[x].B;
                                colorCount++;
                            }
                        }
                    }
                });

                baseImage.Mutate(ctx => ctx.DrawImage(avatar, new Point((int)(headX - headRadius), (int)(headY - headRadius)), 1f));

                using MemoryStream ms = new();
                baseImage.Save(ms, new PngEncoder());

                Color color = colorCount > 0
                    ? new Color((byte)(totalR / colorCount), (byte)(totalG / colorCount), (byte)(totalB / colorCount))
                    : new Color(0xE91E63);

                return (color, ms.ToArray());
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
    }
}
