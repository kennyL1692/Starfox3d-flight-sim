import { createFileRoute } from "@tanstack/react-router";
import { StarfoxGame } from "@/components/StarfoxGame";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Star Runner — 3D Space Shooter" },
      { name: "description", content: "Pilot a starfighter through hostile space in this Three.js powered 3D arcade shooter." },
    ],
  }),
});

function Index() {
  return <StarfoxGame />;
}
