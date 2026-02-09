import { generateText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import env from "../config/env";

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

export type GenerateAiInput = {
  prompt: string;
  userId: string;
};

export const aiService = {
  async generateResponse({ prompt }: GenerateAiInput) {
    const systemPrompt =
      "You are an AI assistant helping a returning user. Use the conversation history to keep continuity, but prefer the latest user prompt when in doubt.";

    const messages: CoreMessage[] = [{ role: "user", content: prompt }];

    const result = await generateText({
      model: openai(env.AI_MODEL),
      system: systemPrompt,
      messages,
    });

    return {
      text: result.text,
      sessionId: `ephemeral_${Date.now()}`,
      model: env.AI_MODEL,
      createdAt: new Date(),
    };
  },
};
