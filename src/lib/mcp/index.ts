import { defineMcp } from "@lovable.dev/mcp-js";
import getGameInfoTool from "./tools/get-game-info";
import scoreRatingTool from "./tools/score-rating";

export default defineMcp({
  name: "star-runner-mcp",
  title: "Star·Runner MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Star·Runner 3D space shooter. Use `get_game_info` for an overview of controls and scoring, and `score_rating` to convert a final score into a pilot rank.",
  tools: [getGameInfoTool, scoreRatingTool],
});
