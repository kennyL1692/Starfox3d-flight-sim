import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_game_info",
  title: "Get game info",
  description: "Return an overview of the Star·Runner game: premise, controls, and scoring.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            name: "Star·Runner",
            genre: "3D on-rails space shooter (Starfox-inspired)",
            engine: "three.js + React",
            controls: {
              keyboard: "WASD or Arrow keys to steer, Space to fire",
              mouse: "Move to aim, click to fire",
            },
            scoring: {
              enemy_kill: 100,
              asteroid_destroyed: 25,
              hull_hit_penalty: "loses 1 hull segment (start with 3)",
            },
            tips: [
              "Bank hard to dodge asteroid clusters — banking is visual only, position still matters.",
              "Chain enemy kills for the 'NICE!' affirmation streak.",
              "Watch the red vignette — if it flashes, you're about to lose a hull.",
            ],
          },
          null,
          2,
        ),
      },
    ],
  }),
});
