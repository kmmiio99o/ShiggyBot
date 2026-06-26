using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a File component — displays an uploaded file attachment.</summary>
    internal sealed class FileBuilder : IV2ComponentBuilder
    {
        private string? _url;
        private bool _spoiler;

        /// <summary>Sets the attachment filename (uses attachment:// protocol).</summary>
        public FileBuilder WithAttachment(string filename)
        {
            _url = $"attachment://{filename}";
            return this;
        }

        /// <summary>Marks the file as a spoiler.</summary>
        public FileBuilder AsSpoiler(bool spoiler = true)
        {
            _spoiler = spoiler;
            return this;
        }

        /// <summary>Writes this File component as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", (int)ComponentType.File);
            writer.WriteStartObject("file");
            if (_url is not null)
            {
                writer.WriteString("url", _url);
            }

            writer.WriteEndObject();
            if (_spoiler)
            {
                writer.WriteBoolean("spoiler", true);
            }

            writer.WriteEndObject();
        }
    }
}
