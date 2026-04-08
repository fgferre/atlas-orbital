import type { CelestialBody } from "./astrophysics";

export interface BodySearchResult {
  body: CelestialBody;
  matchedField: "name" | "classification" | "type" | "id";
  score: number;
}

const normalizeSearchTerm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const startsWithWord = (value: string, query: string) =>
  value.split(/\s+/).some((word) => word.startsWith(query));

const scoreBody = (body: CelestialBody, query: string) => {
  const fields = [
    { value: body.id, matchedField: "id" as const, weights: [120, 96, 86, 74] },
    {
      value: body.name.en,
      matchedField: "name" as const,
      weights: [140, 112, 94, 82],
    },
    {
      value: body.name.pt,
      matchedField: "name" as const,
      weights: [138, 110, 92, 80],
    },
    {
      value: body.classification,
      matchedField: "classification" as const,
      weights: [72, 60, 52, 42],
    },
    {
      value: body.type,
      matchedField: "type" as const,
      weights: [64, 54, 48, 38],
    },
  ];

  let bestMatch: BodySearchResult | null = null;

  for (const field of fields) {
    if (!field.value) {
      continue;
    }

    const normalizedValue = normalizeSearchTerm(field.value);
    if (!normalizedValue) {
      continue;
    }

    let score = 0;
    if (normalizedValue === query) {
      score = field.weights[0];
    } else if (normalizedValue.startsWith(query)) {
      score = field.weights[1];
    } else if (startsWithWord(normalizedValue, query)) {
      score = field.weights[2];
    } else if (normalizedValue.includes(query)) {
      score = field.weights[3];
    }

    if (!score) {
      continue;
    }

    const candidate = {
      body,
      matchedField: field.matchedField,
      score,
    };

    if (!bestMatch || candidate.score > bestMatch.score) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
};

export const searchBodies = (
  query: string,
  bodies: CelestialBody[],
  limit = 8
) => {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) {
    return [];
  }

  return bodies
    .map((body) => scoreBody(body, normalizedQuery))
    .filter((result): result is BodySearchResult => Boolean(result))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.body.name.en.localeCompare(right.body.name.en);
    })
    .slice(0, limit);
};
