import { GoogleGenAI, Type } from "@google/genai";
import { AdContext, Platform, ReplyGenerationResult, Sentiment } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-3-pro-preview';

export const analyzeAndReply = async (
  comment: string,
  platform: Platform,
  context: AdContext
): Promise<ReplyGenerationResult> => {
  
  if (!apiKey) {
    // Return mock data if no key for UI demo purposes
    return {
      reply: "Please configure your API Key to generate real AI responses.",
      reasoning: "Missing API Key",
      sentiment: Sentiment.NEUTRAL,
      humanScore: 0
    };
  }

  const systemInstruction = `
    You are an expert Social Media Community Manager for the brand "${context.productName}".
    
    Context:
    ${context.description}
    
    Your Goal:
    Generate a highly engaging, human-like, and context-aware reply to the user's comment on an advertisement.
    
    Guidelines for "Escaping Bot Detection" (Appearing Human):
    1. Do NOT use generic corporate speak like "Thank you for your feedback."
    2. Match the user's vibe (emojis, sentence length).
    3. If it's a question, answer it directly based on the context.
    4. If it's a hate comment, be witty but polite, or ignore (neutral).
    5. Vary sentence structure. Do not start every sentence with the same word.
    6. Tone: ${context.tone}.
    7. Forbidden words: ${context.forbiddenKeywords.join(', ')}.
    
    Output Format:
    Return a JSON object containing the reply, the sentiment of the original comment, and a reasoning for the reply strategy.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Platform: ${platform}\nUser Comment: "${comment}"`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "The generated human-like reply text." },
            reasoning: { type: Type.STRING, description: "Why this reply was chosen." },
            sentiment: { type: Type.STRING, enum: [Sentiment.POSITIVE, Sentiment.NEGATIVE, Sentiment.NEUTRAL, Sentiment.SPAM] },
            humanScore: { type: Type.NUMBER, description: "A confidence score (0-100) on how natural/human this sounds." }
          },
          required: ["reply", "reasoning", "sentiment", "humanScore"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    const result = JSON.parse(jsonText) as ReplyGenerationResult;
    return result;

  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback for demo stability
    return {
      reply: "Thanks for reaching out! We'd love to help.",
      reasoning: "Fallback due to API error.",
      sentiment: Sentiment.NEUTRAL,
      humanScore: 50
    };
  }
};
