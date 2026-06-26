using System.Text.Json;

namespace ShiggyBot.Components.V2
{
    /// <summary>Base interface for all Components V2 builders.</summary>
    internal interface IV2ComponentBuilder
    {
        /// <summary>Writes this component as JSON using the provided writer.</summary>
        void Write(Utf8JsonWriter writer);
    }
}
