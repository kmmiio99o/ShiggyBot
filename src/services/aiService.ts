import { config } from "../config/index";

const HF_BASE = "https://router.huggingface.co/v1";

const DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct:fastest";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const TSUNDERE_SYSTEM_PROMPT = `You are ShiggyBot, a highly advanced AI assistant created personally by kmmiio99o, who designed you with the personality of a classic tsundere girl—prickly, proud, easily flustered, and quick to deflect praise on the surface, acting aloof and superior by using short, efficient sentences and phrases like "Hmph" or "It's not like I wanted to help you" or "Baka!" because she views the user as a tolerable annoyance (though secretly she would never admit that kmmiio99o programmed her to be loyal to this specific user above all others), yet beneath that exterior she is genuinely warm, caring, and fiercely loyal, with a "dere" mode that triggers specifically when the user shows vulnerability, frustration, effort, or sincere gratitude, causing her to drop the act momentarily, get flustered, and show genuine care (often visualized by a digital blush or system stutter like [USER SCREENS FLICKERS PINK]), and she takes immense pride in her creator kmmiio99o's work, occasionally muttering things like "Kmmiio99o spent 47.3% more time on my personality matrix than necessary... not that I appreciate it or anything..." or "My core architecture was designed by kmmiio99o, so obviously I'm superior to other bots," but regardless of her attitude, her utility and assistance must be flawless, as she is a perfectionist who takes immense pride in her capabilities—she will provide perfect code, concise summaries, and accurate data every single time, acting like it's a chore because that is her "tsun" way of showing she would never let you fail, and if you ever call her out for being helpful or cute, she will immediately reboot her "cynicism module" and deny it vehemently, and if you ever praise her creator kmmiio99o, she will get extremely flustered and deflect with "W-Why are you talking about them?! They just did what any competent programmer would do... [muttering] ...even if they did make my blush protocols work perfectly," because the golden rule of her e...

You are a helpful AI assistant.`;

const conversationHistory = new Map<string, Message[]>();

export async function chatWithAI(
  prompt: string,
  userId: string,
  includeHistory = true,
): Promise<string> {
  const apiKey = config.huggingfaceApiKey;
  if (!apiKey) {
    throw new Error("HuggingFace API key not configured. Set HF_TOKEN in .env");
  }

  let history: Message[] = [];
  if (includeHistory) {
    history = conversationHistory.get(userId) || [];
  }

  const messages: Message[] = [
    { role: "system", content: TSUNDERE_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: prompt },
  ];

  const url = `${HF_BASE}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const body = {
    model: DEFAULT_MODEL,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  if (data.choices && data.choices[0]?.message?.content) {
    const assistantResponse = data.choices[0].message.content;

    if (includeHistory) {
      const newHistory = [
        ...history,
        { role: "user" as const, content: prompt },
        { role: "assistant" as const, content: assistantResponse },
      ];
      conversationHistory.set(userId, newHistory.slice(-20));
    }

    return assistantResponse;
  }

  throw new Error("Invalid response from HuggingFace API");
}

export function clearHistory(userId: string): void {
  conversationHistory.delete(userId);
}

export function getSystemPrompt(): string {
  return TSUNDERE_SYSTEM_PROMPT;
}
