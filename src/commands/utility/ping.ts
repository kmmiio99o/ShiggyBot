import { Message, EmbedBuilder, type ColorResolvable } from "discord.js";
import { PrefixCommand } from "../types";

const pingCommand: PrefixCommand = {
  name: "ping",
  description: "Checks the bot's latency.",
  async execute(message: Message) {
    // Initial embed to show we're measuring
    const initialEmbed = new EmbedBuilder()
      .setTitle("🏓 Measuring Latency...")
      .setColor("#FFFF00" as ColorResolvable)
      .setDescription("Please wait while I calculate the response times...")
      .setFooter({
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();

    const sent = await message.reply({ embeds: [initialEmbed] });

    const latency = sent.createdTimestamp - message.createdTimestamp;
    const rawApiLatency = message.client.ws.ping;

    // Handle the -1 case for API latency
    let apiLatency: number;
    let apiStatus = "🟢 Measured";

    if (rawApiLatency < 0) {
      apiLatency = 0;
      apiStatus = "🟡 Calculating";
    } else {
      apiLatency = Math.round(rawApiLatency);
    }

    // Determine status color based on latency
    let statusColor: ColorResolvable = "#00FF00";
    let statusEmoji = "✅";
    let statusText = "Excellent";

    // Use bot latency if API latency is unavailable
    const effectiveLatency = apiLatency > 0 ? apiLatency : latency;

    if (effectiveLatency > 200) {
      statusColor = "#FFFF00";
      statusEmoji = "⚠️";
      statusText = "Moderate";
    }

    if (effectiveLatency > 500) {
      statusColor = "#FF0000";
      statusEmoji = "🔴";
      statusText = "High";
    }

    if (effectiveLatency > 1000) {
      statusColor = "#8B0000";
      statusEmoji = "🚨";
      statusText = "Critical";
    }

    const pingEmbed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .setColor(statusColor)
      .setDescription(`Response time measurement complete`)
      .addFields(
        {
          name: `${statusEmoji} Status`,
          value: statusText,
          inline: true,
        },
        {
          name: "🤖 Bot Latency",
          value: `${latency}ms`,
          inline: true,
        },
        {
          name: "🌐 API Latency",
          value: rawApiLatency < 0 ? "📡 Measuring..." : `${apiLatency}ms`,
          inline: true,
        },
        {
          name: "📊 Performance",
          value: getPerformanceDescription(effectiveLatency),
          inline: false,
        },
        {
          name: "📶 Connection Status",
          value: apiStatus,
          inline: false,
        },
      )
      .setFooter({
        text: `Requested by ${message.author.tag} • Total response: ${latency}ms`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();

    await sent.edit({ embeds: [pingEmbed] });
  },
};

function getPerformanceDescription(latency: number): string {
  if (latency < 100)
    return "✨ **Excellent** - Bot is responding very quickly!";
  if (latency < 200) return "✅ **Good** - Bot is responding well.";
  if (latency < 500) return "⚠️ **Moderate** - Response times are acceptable.";
  if (latency < 1000)
    return "🔴 **High** - Response times are slower than usual.";
  return "🚨 **Critical** - Very high latency, there may be connection issues.";
}

export default pingCommand;
