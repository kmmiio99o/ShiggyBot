using System.Buffers;
using System.Text.Json;

namespace ShiggyBot.Components.V1
{
    internal sealed class V1MessageBuilder
    {
        private string? _content;
        private readonly List<V1EmbedBuilder> _embeds = [];
        private readonly List<IV1Component> _components = [];
        private int? _flags;

        public V1MessageBuilder WithContent(string content) { _content = content; return this; }
        public V1MessageBuilder AddEmbed(V1EmbedBuilder embed) { _embeds.Add(embed); return this; }
        public V1MessageBuilder AddComponent(IV1Component component) { _components.Add(component); return this; }
        public V1MessageBuilder WithFlags(int flags) { _flags = flags; return this; }

        public byte[] Build()
        {
            ArrayBufferWriter<byte> buffer = new();
            using Utf8JsonWriter writer = new(buffer);
            writer.WriteStartObject();

            if (_content is not null)
            {
                writer.WriteString("content", _content);
            }

            if (_embeds.Count > 0)
            {
                writer.WriteStartArray("embeds");
                foreach (V1EmbedBuilder embed in _embeds)
                {
                    embed.Write(writer);
                }
                writer.WriteEndArray();
            }

            if (_components.Count > 0)
            {
                writer.WriteStartArray("components");
                foreach (IV1Component component in _components)
                {
                    component.Write(writer);
                }
                writer.WriteEndArray();
            }

            if (_flags.HasValue)
            {
                writer.WriteNumber("flags", _flags.Value);
            }

            writer.WriteEndObject();
            writer.Flush();
            return buffer.WrittenSpan.ToArray();
        }
    }
}
