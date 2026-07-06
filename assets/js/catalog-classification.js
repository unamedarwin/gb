import { MUSCLE_RULES } from "./config.js";

const WORD_BOUNDARY = "[^a-z0-9]";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCatalogText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&amp;/gi, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildClassificationText({ title, handle, tags, collectionLabel, plainDescription, equipmentType }) {
  const baseFields = [title, handle, Array.isArray(tags) ? tags.join(" ") : tags, collectionLabel];
  const descriptionFields = equipmentType === "machine" ? [plainDescription] : [];
  return normalizeCatalogText([...baseFields, ...descriptionFields].join(" "));
}

export function matchesKeyword(searchText, keyword) {
  const normalizedText = normalizeCatalogText(searchText);
  const normalizedKeyword = normalizeCatalogText(keyword);
  if (!normalizedText || !normalizedKeyword) {
    return false;
  }

  const pattern = new RegExp(`(^|${WORD_BOUNDARY})${escapeRegex(normalizedKeyword).replace(/\s+/g, "\\s+")}($|${WORD_BOUNDARY})`, "i");
  return pattern.test(normalizedText);
}

export function deriveMuscleGroups({ searchText, family }) {
  if (family === "cardio") {
    return ["cardio", "legs"];
  }

  const found = Object.entries(MUSCLE_RULES)
    .filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(searchText, keyword)))
    .map(([muscle]) => muscle);

  return found.length ? Array.from(new Set(found)) : ["all"];
}
