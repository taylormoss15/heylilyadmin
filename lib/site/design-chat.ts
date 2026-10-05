import { z } from "zod";

export const screenshotSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().min(4).max(4 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export const designChatSchema = z.object({
  instruction: z.string().trim().min(1).max(8000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(12000),
    screenshots: z.array(screenshotSchema).max(2).optional(),
  })).max(12).default([]),
  screenshots: z.array(screenshotSchema).max(2).default([]),
  chat: z.boolean().default(false),
}).refine((value) => value.screenshots.length + value.history.reduce((n, turn) => n + (turn.screenshots?.length || 0), 0) <= 4, "Too many screenshot references. Start a new conversation.");
export type DesignChatContext = Pick<z.infer<typeof designChatSchema>, "history" | "screenshots">;
