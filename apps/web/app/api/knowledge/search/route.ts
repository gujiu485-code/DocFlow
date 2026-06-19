import { searchKnowledgeBase } from "@/lib/knowledge-service";

export const runtime = "nodejs";

const clampText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeDocumentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))].slice(0, 500);
};

const normalizeLimit = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(Math.floor(value), 50));
};

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const keyword = clampText(body?.keyword, 500);

  if (!keyword) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchKnowledgeBase({
      keyword,
      documentIds: normalizeDocumentIds(body?.documentIds),
      limit: normalizeLimit(body?.limit),
    });

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "后端知识库搜索失败。",
      },
      { status: 500 },
    );
  }
}
