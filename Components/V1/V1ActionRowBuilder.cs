using System.Text.Json;

namespace ShiggyBot.Components.V1
{
    internal sealed class V1ActionRowBuilder : IV1Component
    {
        private readonly List<IV1Component> _components = [];

        public V1ActionRowBuilder AddComponent(IV1Component component)
        {
            _components.Add(component);
            return this;
        }

        public void Write(Utf8JsonWriter writer)
        {
            writer.WriteStartObject();
            writer.WriteNumber("type", 1);
            writer.WriteStartArray("components");
            foreach (IV1Component component in _components)
            {
                component.Write(writer);
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
    }
}
