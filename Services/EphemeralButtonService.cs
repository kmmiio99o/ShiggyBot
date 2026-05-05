using System.Collections.Concurrent;
using Discord.WebSocket;

namespace ShiggyBot.Services
{
    /// <summary>
    /// Service for handling ephemeral button interactions.
    /// </summary>
    internal static class EphemeralButtonService
    {
        private static readonly ConcurrentDictionary<string, Func<SocketMessageComponent, Task>> _handlers = new();

        /// <summary>
        /// Registers a one-shot ephemeral handler for a specific button.
        /// </summary>
        /// <param name="key">The custom ID of the button.</param>
        /// <param name="handler">The handler function to execute.</param>
        public static void Register(string key, Func<SocketMessageComponent, Task> handler)
        {
            _handlers[key] = handler;
        }

        /// <summary>
        /// Tries to handle an incoming button interaction.
        /// </summary>
        /// <param name="component">The socket message component.</param>
        /// <returns>True if handled; otherwise, false.</returns>
        public static bool TryHandle(SocketMessageComponent? component)
        {
            if (component?.Data?.CustomId == null)
            {
                return false;
            }
            string key = component.Data.CustomId;
            if (_handlers.TryRemove(key, out Func<SocketMessageComponent, Task>? handler))
            {
                // Fire and forget; ensure we don't block the interaction pipeline
                _ = handler(component);
                return true;
            }
            return false;
        }
    }
}
