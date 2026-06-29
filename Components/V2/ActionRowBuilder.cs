using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Builds a V1 action row (type 1) that wraps other components like select menus.</summary>
    internal sealed class ActionRowBuilder : IV2ComponentBuilder
    {
        private readonly List<IV2ComponentBuilder> _components = [];

        /// <summary>Adds a component to the action row.</summary>
        public ActionRowBuilder AddComponent(IV2ComponentBuilder component)
        {
            _components.Add(component);
            return this;
        }

        /// <summary>Writes this ActionRow as JSON.</summary>
        public void Write(Utf8JsonWriter writer)
        {
            ArgumentNullException.ThrowIfNull(writer);
            writer.WriteStartObject();
            writer.WriteNumber("type", 1);
            writer.WriteStartArray("components");
            foreach (IV2ComponentBuilder component in _components)
            {
                component.Write(writer);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }
    }
}
