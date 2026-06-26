using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a Thumbnail component — small image accessory for sections.</summary>
    internal sealed class ThumbnailBuilder : IV2ComponentBuilder
    {
        private Uri? _url;
        private string? _description;
        private bool _spoiler;

        /// <summary>Sets the media URL for the thumbnail.</summary>
        public ThumbnailBuilder WithMedia(Uri uri)
        {
            _url = uri;
            return this;
        }

        /// <summary>Sets alt text description for the media.</summary>
        public ThumbnailBuilder WithDescription(string description)
        {
            _description = description;
            return this;
        }

        /// <summary>Marks the thumbnail as a spoiler.</summary>
        public ThumbnailBuilder AsSpoiler(bool spoiler = true)
        {
            _spoiler = spoiler;
            return this;
        }

        /// <summary>Writes this Thumbnail as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.Thumbnail);
            writer.WriteStartObject("media");
            if (_url is not null)
            {
                writer.WriteString("url", _url.ToString());
            }

            writer.WriteEndObject();
            if (_description is not null)
            {
                writer.WriteString("description", _description);
            }

            if (_spoiler)
            {
                writer.WriteBoolean("spoiler", true);
            }

            writer.WriteEndObject();
        }
    }
}
