import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "score_rating",
  title: "Rate a score",
  description: "Return a pilot rank for a given Star·Runner score.",
  inputSchema: {
    score: z.number().int().min(0).describe("The final score achieved in a run."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ score }) => {
    const rank =
      score >= 5000
        ? "Ace Commander"
        : score >= 2500
          ? "Wing Leader"
          : score >= 1000
            ? "Veteran Pilot"
            : score >= 300
              ? "Rookie"
              : "Cadet";
    return {
      content: [{ type: "text", text: `Score ${score} → ${rank}` }],
      structuredContent: { score, rank },
    };
  },
});
