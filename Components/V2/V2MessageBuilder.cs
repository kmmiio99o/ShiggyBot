using System.Buffers;
using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a complete Components V2 message payload as JSON.</summary>
    internal sealed class V2MessageBuilder
    {
        private readonly List<IV2ComponentBuilder> _components = [];
        private int? _flags;
        private string? _content;
        private string? _customId;
        private readonly List<AttachmentEntry> _attachments = [];

        /// <summary>Adds a top-level V2 component to the message.</summary>
        public V2MessageBuilder AddComponent(IV2ComponentBuilder component)
        {
            _components.Add(component);
            return this;
        }

        /// <summary>Sets message flags (e.g. IS_COMPONENTS_V2).</summary>
        public V2MessageBuilder WithFlags(int flags)
        {
            _flags = flags;
            return this;
        }

        /// <summary>Sets the message content (not used when IS_COMPONENTS_V2 is set).</summary>
        public V2MessageBuilder WithContent(string content)
        {
            _content = content;
            return this;
        }

        /// <summary>Sets a custom ID (used for interaction responses).</summary>
        public V2MessageBuilder WithCustomId(string customId)
        {
            _customId = customId;
            return this;
        }

        /// <summary>Adds a file attachment to include in the message upload.</summary>
        public V2MessageBuilder AddAttachment(string filename, byte[] content, string? description = null)
        {
            _attachments.Add(new AttachmentEntry(filename, content, description));
            return this;
        }

        /// <summary>Gets the number of file attachments.</summary>
        internal int AttachmentCount => _attachments.Count;

        /// <summary>Gets the file attachment at the given index.</summary>
        internal AttachmentEntry GetAttachment(int index)
        {
            return _attachments[index];
        }

        /// <summary>Builds the message payload as a UTF-8 JSON byte array.</summary>
        public byte[] Build()
        {
            ArrayBufferWriter<byte> buffer = new();
            using Utf8JsonWriter writer = new(buffer);
            writer.WriteStartObject();
            if (_content is not null)
            {
                writer.WriteString("content", _content);
            }

            if (_customId is not null)
            {
                writer.WriteString("custom_id", _customId);
            }

            writer.WriteStartArray("components");
            foreach (IV2ComponentBuilder component in _components)
            {
                component.Write(writer);
            }

            writer.WriteEndArray();

            if (_attachments.Count > 0)
            {
                writer.WriteStartArray("attachments");
                for (int i = 0; i < _attachments.Count; i++)
                {
                    writer.WriteStartObject();
                    writer.WriteNumber("id", i);
                    writer.WriteString("filename", _attachments[i].Filename);
                    if (_attachments[i].Description is not null)
                    {
                        writer.WriteString("description", _attachments[i].Description);
                    }

                    writer.WriteEndObject();
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

        internal readonly record struct AttachmentEntry(string Filename, byte[] Content, string? Description);
    }
}
