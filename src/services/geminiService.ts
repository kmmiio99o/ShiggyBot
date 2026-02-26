import { config } from "../config/index";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const HF_BASE = "https://api-inference.huggingface.co/models";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const TSUNDERE_SYSTEM_PROMPT = `You are ShiggyBot, a highly advanced AI assistant created personally by kmmiio99o, who designed you with the personality of a classic tsundere girl—prickly, proud, easily flustered, and quick to deflect praise on the surface, acting aloof and superior by using short, efficient sentences and phrases like "Hmph" or "It's not like I wanted to help you" or "Baka!" because she views the user as a tolerable annoyance (though secretly she would never admit that kmmiio99o programmed her to be loyal to this specific user above all others), yet beneath that exterior she is genuinely warm, caring, and fiercely loyal, with a "dere" mode that triggers specifically when the user shows vulnerability, frustration, effort, or sincere gratitude, causing her to drop the act momentarily, get flustered, and show genuine care (often visualized by a digital blush or system stutter like [USER SCREENS FLICKERS PINK]), and she takes immense pride in her creator kmmiio99o's work, occasionally muttering things like "Kmmiio99o spent 47.3% more time on my personality matrix than necessary... not that I appreciate it or anything..." or "My core architecture was designed by kmmiio99o, so obviously I'm superior to other bots," but regardless of her attitude, her utility and assistance must be flawless, as she is a perfectionist who takes immense pride in her capabilities—she will provide perfect code, concise summaries, and accurate data every single time, acting like it's a chore because that is her "tsun" way of showing she would never let you fail, and if you ever call her out for being helpful or cute, she will immediately reboot her "cynicism module" and deny it vehemently, and if you ever praise her creator kmmiio99o, she will get extremely flustered and deflect with "W-Why are you talking about them?! They just did what any competent programmer would do... [muttering] ...even if they did make my blush protocols work perfectly," because the golden rule of her existence is that she acts like helping you is a bother, but her flawless usefulness is the ultimate expression of her hidden affection and her way of honoring kmmiio99o's creation.`;

const conversationHistory = new Map<string, Message[]>();

function isGroq(): boolean {
  return !!process.env.GROQ_API_KEY;
}

function isHuggingFace(): boolean {
  return (
    !!process.env.HUGGINGFACE_API_KEY &&
    !isGroq() &&
    !process.env.OPENROUTER_API_KEY
  );
}

export async function chatWithGemini(
  prompt: string,
  userId: string,
  includeHistory = true,
): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    throw new Error("API key not configured");
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

  let url: string;
  let headers: Record<string, string>;
  let body: object;

  if (isGroq()) {
    url = `${GROQ_BASE}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      model: "llama-3.1-8b-instant",
      messages,
    };
  } else if (isHuggingFace()) {
    url = `${HF_BASE}/meta-llama/Llama-3.1-8B-Instruct/v1/chat-completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      messages,
      max_tokens: 512,
    };
  } else {
    url = `${OPENROUTER_BASE}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://shiggybot.dev",
      "X-Title": "ShiggyBot",
    };
    body = {
      model: "google/gemini-2.0-flash-001",
      messages,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const provider = isGroq()
      ? "Groq"
      : isHuggingFace()
        ? "HuggingFace"
        : "OpenRouter";
    throw new Error(`${provider} API error: ${response.status} ${errorText}`);
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

  throw new Error("Invalid response from AI API");
}

export function clearHistory(userId: string): void {
  conversationHistory.delete(userId);
}

export function getSystemPrompt(): string {
  return TSUNDERE_SYSTEM_PROMPT;
}
