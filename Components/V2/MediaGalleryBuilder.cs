using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a MediaGallery component — displays 1–10 images in a gallery.</summary>
    internal sealed class MediaGalleryBuilder : IV2ComponentBuilder
    {
        private readonly List<MediaGalleryItem> _items = [];

        /// <summary>Adds a media item to the gallery.</summary>
        public MediaGalleryBuilder AddItem(Uri uri, string? description = null, bool spoiler = false)
        {
            _items.Add(new MediaGalleryItem(uri, description, spoiler));
            return this;
        }

        /// <summary>Writes this MediaGallery as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.MediaGallery);
            writer.WriteStartArray("items");
            foreach (MediaGalleryItem item in _items)
            {
                item.Write(writer);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        internal readonly struct MediaGalleryItem
        {
            private readonly Uri _url;
            private readonly string? _description;
            private readonly bool _spoiler;

            internal MediaGalleryItem(Uri url, string? description, bool spoiler)
            {
                _url = url;
                _description = description;
                _spoiler = spoiler;
            }

            public void Write(Utf8JsonWriter writer)
            {
                ArgumentNullException.ThrowIfNull(writer);
                writer.WriteStartObject();
                writer.WriteStartObject("media");
                writer.WriteString("url", _url.ToString());
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
}
