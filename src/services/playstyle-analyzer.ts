import { PlayerBrawler, Playstyle } from "@/types/player";

interface PlaystyleAnalysis {
  playstyle: Playstyle;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/**
 * Analyze a player's brawler usage to classify their playstyle
 * and generate actionable feedback.
 */
export function analyzePlaystyle(
  brawlers: PlayerBrawler[]
): PlaystyleAnalysis {
  if (brawlers.length === 0) {
    return {
      playstyle: "balanced",
      strengths: ["No data available"],
      weaknesses: [],
      suggestions: ["Play more matches to generate analysis"],
    };
  }

  // Weight by trophies (higher trophies = more played)
  const totalTrophies = brawlers.reduce((s, b) => s + b.trophies, 0);

  const typeWeights: Record<string, number> = {};
  brawlers.forEach((b) => {
    const weight = b.trophies / (totalTrophies || 1);
    typeWeights[b.brawlerType] = (typeWeights[b.brawlerType] || 0) + weight;
  });

  const aggressiveWeight =
    (typeWeights["tank"] || 0) + (typeWeights["assassin"] || 0);
  const passiveWeight =
    (typeWeights["sniper"] || 0) + (typeWeights["thrower"] || 0);
  const controlWeight = typeWeights["lane"] || 0;

  let playstyle: Playstyle;
  if (aggressiveWeight > 0.45) {
    playstyle = "aggressive";
  } else if (passiveWeight > 0.4) {
    playstyle = "passive";
  } else {
    playstyle = "balanced";
  }

  return {
    playstyle,
    strengths: getStrengths(playstyle),
    weaknesses: getWeaknesses(playstyle),
    suggestions: getSuggestions(playstyle, typeWeights),
  };
}

function getStrengths(playstyle: Playstyle): string[] {
  switch (playstyle) {
    case "aggressive":
      return [
        "Strong close-range combat skills",
        "Good at rushing objectives",
        "High-pressure play in tight spaces",
        "Effective on Brawl Ball and close-range maps",
      ];
    case "passive":
      return [
        "Excellent long-range aim and positioning",
        "Strong zone control and area denial",
        "Safe, consistent damage output",
        "Effective on Bounty and open maps",
      ];
    case "balanced":
      return [
        "Versatile brawler pool",
        "Adaptable to different team compositions",
        "Good map awareness across modes",
        "Reliable in most matchups",
      ];
  }
}

function getWeaknesses(playstyle: Playstyle): string[] {
  switch (playstyle) {
    case "aggressive":
      return [
        "Vulnerable on open maps with long sight lines",
        "Can overextend against coordinated teams",
        "Struggles against sniper-heavy compositions",
      ];
    case "passive":
      return [
        "Vulnerable to dive and assassin compositions",
        "Weaker on close-range maps like Brawl Ball",
        "May lack aggression for objective-focused modes",
      ];
    case "balanced":
      return [
        "May lack specialization in competitive play",
        "Harder to build deep mastery across many types",
      ];
  }
}

function getSuggestions(
  playstyle: Playstyle,
  typeWeights: Record<string, number>
): string[] {
  const suggestions: string[] = [];

  if (playstyle === "aggressive") {
    if ((typeWeights["sniper"] || 0) < 0.1) {
      suggestions.push(
        "Practice long-range brawlers (Piper, Brock) to cover open maps"
      );
    }
    suggestions.push("Focus on reading enemy rotations before diving");
    suggestions.push(
      "Consider learning throwers for wall-heavy maps"
    );
  } else if (playstyle === "passive") {
    if ((typeWeights["tank"] || 0) < 0.1) {
      suggestions.push(
        "Pick up a tank (Rosa, Frank) for Brawl Ball"
      );
    }
    suggestions.push("Work on close-range mechanics for emergencies");
    suggestions.push(
      "Practice aggressive timing to contest objectives"
    );
  } else {
    suggestions.push(
      "Identify your best 2-3 brawlers per mode and specialize"
    );
    suggestions.push(
      "Study counter matchups to sharpen draft picks"
    );
    suggestions.push(
      "Push your best type to higher trophies for deeper mastery"
    );
  }

  return suggestions;
}
