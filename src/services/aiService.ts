import { generateText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import env from "../config/env";
import { prisma } from "../lib/prisma";

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

export type GenerateAiInput = {
  prompt: string;
  userId: string;
};

const HISTORY_LIMIT = 5;

export const aiService = {
  async generateResponse({ prompt, userId }: GenerateAiInput) {
    const previousSessions = await prisma.aiSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });

    const systemPrompt =
      "You are an AI assistant helping a returning user. Use the conversation history to keep continuity, but prefer the latest user prompt when in doubt.";

    const messages: CoreMessage[] = previousSessions
      .slice()
      .reverse()
      .flatMap((session) => [
        { role: "user" as const, content: session.prompt },
        { role: "assistant" as const, content: session.response },
      ]);
    messages.push({ role: "user", content: prompt });

    const result = await generateText({
      model: openai(env.AI_MODEL),
      system: systemPrompt,
      messages,
    });

    const session = await prisma.aiSession.create({
      data: {
        userId,
        prompt,
        response: result.text,
        model: env.AI_MODEL,
      },
    });

    return {
      text: result.text,
      sessionId: session.id,
      model: session.model,
      createdAt: session.createdAt,
    };
  },
};
