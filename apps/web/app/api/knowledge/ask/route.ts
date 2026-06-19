import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type CoreMessage } from "ai";
import { retrieveKnowledgeContext } from "@/lib/knowledge-service";
import type { RagProvider } from "@/lib/rag/types";

export const runtime = "nodejs";

type AskContextChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  text: string;
  score?: number;
  snippet?: string;
};

type AskCitation = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  quote: string;
};

type AskContextSource = "local" | Exclude<RagProvider, "local">;

type AskRetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  text: string;
  score: number | null;
  provider: AskContextSource;
};

const clampText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeDocumentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))].slice(0, 500);
};

const createCitations = (chunks: AskContextChunk[]): AskCitation[] =>
  chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    headingPath: chunk.headingPath ?? [],
    quote: chunk.text.slice(0, 180),
  }));

const createRetrievedChunks = (chunks: AskContextChunk[], provider: AskContextSource): AskRetrievedChunk[] =>
  chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    headingPath: chunk.headingPath ?? [],
    text: (chunk.snippet || chunk.text).slice(0, 900),
    score: typeof chunk.score === "number" ? chunk.score : null,
    provider,
  }));

export async function POST(req: Request): Promise<Response> {
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === "") {
    return Response.json({ error: "缺少 DEEPSEEK_API_KEY，请在 .env 文件中配置。" }, { status: 400 });
  }

  const body = await req.json();
  const question = clampText(body.question, 500);
  const allowedDocumentIds = normalizeDocumentIds(body.allowedDocumentIds);

  if (!question) {
    return Response.json({ error: "请输入问题。" }, { status: 400 });
  }

  const backendResult = await retrieveKnowledgeContext(question, allowedDocumentIds);
  const chunks: AskContextChunk[] = backendResult.chunks;
  const contextSource: AskContextSource = backendResult.source;

  if (!chunks.length) {
    return Response.json({ error: "没有可用于回答的知识片段，请先同步知识库。" }, { status: 400 });
  }

  const deepseek = createOpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    compatibility: "compatible",
  });

  const contextText = chunks
    .map((chunk, index) =>
      [
        `资料 [${index + 1}]`,
        `文档：${chunk.documentTitle}`,
        chunk.headingPath?.length ? `位置：${chunk.headingPath.join(" / ")}` : "",
        `内容：${chunk.text}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");

  const messages: CoreMessage[] = [
    {
      role: "system",
      content:
        "你是 DocFlow AI 的企业知识库问答助手。你必须只依据用户提供的资料回答，不要编造资料外的信息。回答使用中文，专业、简洁。若资料不足，请明确说明“当前知识库资料不足以回答”。回答中尽量使用 [1]、[2] 这样的编号标注信息来源。",
    },
    {
      role: "user",
      content: ["请基于下面的知识库资料回答问题。", "", `问题：${question}`, "", "知识库资料：", contextText].join(
        "\n",
      ),
    },
  ];

  const result = await generateText({
    messages,
    maxTokens: 1200,
    temperature: 0.2,
    model: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
  });

  return Response.json({
    answer: result.text.trim(),
    citations: createCitations(chunks),
    provider: contextSource,
    retrievedChunks: createRetrievedChunks(chunks, contextSource),
  });
}
