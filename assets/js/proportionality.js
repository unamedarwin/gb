import { MUSCLE_PROPORTIONALITY } from "./config.js";

const FAMILY_FACTORS = {
  lower_push: 1,
  lower_posterior: 0.94,
  upper_pull: 0.8,
  upper_push: 0.74,
  shoulders: 0.6,
  arms: 0.43,
  calves: 0.55,
  core: 0.35,
  cardio: 0.45,
  mixed: 0.72
};

const ADJACENT_FAMILIES = {
  lower_push: ["lower_posterior", "calves", "core"],
  lower_posterior: ["lower_push", "calves", "core"],
  upper_pull: ["upper_push", "arms", "shoulders"],
  upper_push: ["upper_pull", "shoulders", "arms"],
  shoulders: ["upper_push", "upper_pull", "arms"],
  arms: ["upper_push", "upper_pull", "shoulders"],
  calves: ["lower_push", "lower_posterior"],
  core: ["lower_push", "lower_posterior", "upper_push", "upper_pull"],
  cardio: ["lower_push", "upper_push", "core"],
  mixed: ["upper_push", "upper_pull", "lower_push", "lower_posterior", "core"]
};

const PLATE_LOADED_COLLECTIONS = new Set(["iron-force-2022"]);
const PLATE_LOADED_KEYWORDS = [
  "iso lateral",
  "iso-lateral",
  "olympic",
  "olimpic",
  "plate loaded",
  "weight plate",
  "squat lunge",
  "hack squat",
  "leg press",
  "seated calf machine",
  "weight plate tree"
];

export function getTrackedMuscles(muscles) {
  return Array.from(new Set((muscles || []).filter((muscle) => typeof MUSCLE_PROPORTIONALITY[muscle] === "number")));
}

export function getMuscleLoadFactor(muscle) {
  return MUSCLE_PROPORTIONALITY[muscle] ?? null;
}

export function getExerciseLoadFactor(muscles) {
  const tracked = getTrackedMuscles(muscles);
  if (tracked.length === 0) {
    return null;
  }
  return round(tracked.reduce((sum, muscle) => sum + MUSCLE_PROPORTIONALITY[muscle], 0) / tracked.length, 3);
}

export function getMovementFamily(productOrMuscles) {
  const muscles = Array.isArray(productOrMuscles) ? productOrMuscles : productOrMuscles?.muscleGroups || [];
  const pattern = Array.isArray(productOrMuscles) ? "" : String(productOrMuscles?.movementPattern || "");

  if (pattern.includes("squat")) {
    return "lower_push";
  }
  if (pattern.includes("hinge") || muscles.includes("hamstrings") || muscles.includes("glutes")) {
    return "lower_posterior";
  }
  if (pattern.includes("pull_vertical") || pattern.includes("pull_horitzontal") || muscles.includes("back")) {
    return "upper_pull";
  }
  if (pattern.includes("push_vertical")) {
    return "shoulders";
  }
  if (pattern.includes("push_horitzontal") || muscles.includes("chest")) {
    return "upper_push";
  }
  if (muscles.includes("shoulders")) {
    return "shoulders";
  }
  if (muscles.includes("biceps") || muscles.includes("triceps")) {
    return "arms";
  }
  if (muscles.includes("calves")) {
    return "calves";
  }
  if (muscles.includes("core")) {
    return "core";
  }
  if (muscles.includes("cardio")) {
    return "cardio";
  }
  return "mixed";
}

export function inferLoadMetadata(product) {
  const family = getMovementFamily(product);
  const equipmentType = product?.equipmentType || "machine";
  const normalizedSearch = normalizeTextForLoad(product?.searchText || "");
  let loadSystem = normalizeLoadSystem(product?.loadSystem, equipmentType);

  if (!product?.loadSystem && equipmentType === "machine") {
    const collectionHandles = Array.isArray(product?.collectionHandles) ? product.collectionHandles : [];
    const collectionPlateLoaded = collectionHandles.some((handle) => PLATE_LOADED_COLLECTIONS.has(handle));
    const keywordPlateLoaded = PLATE_LOADED_KEYWORDS.some((keyword) => normalizedSearch.includes(keyword));
    loadSystem = collectionPlateLoaded || keywordPlateLoaded ? "plate_loaded" : "stack";
  }

  return {
    loadSystem,
    loadUnit: "kg",
    stepKg: defaultStepKg({ loadSystem, family }),
    baseResistanceKg: estimateBaseResistanceKg({ loadSystem, family }),
    availablePlatesKg: loadSystem === "plate_loaded" || loadSystem === "free_weight" || loadSystem === "support"
      ? [5, 10, 15, 20]
      : []
  };
}

export function buildProgressionProfile(product) {
  const family = getMovementFamily(product);
  const factor = FAMILY_FACTORS[family] ?? FAMILY_FACTORS.mixed;
  const loadMeta = inferLoadMetadata(product);
  const usesBodyweight = loadMeta.loadSystem === "bodyweight";
  let progressionMode = usesBodyweight ? "reps" : "load";
  let growthPotential = defaultGrowthPotential(family);

  if (family === "cardio") {
    progressionMode = "duration";
    growthPotential = "medium";
  } else if (family === "core" && usesBodyweight) {
    progressionMode = "duration";
  }

  return {
    family,
    factor,
    loadSystem: loadMeta.loadSystem,
    stepKg: typeof product?.stepKg === "number" ? product.stepKg : loadMeta.stepKg,
    baseResistanceKg: typeof product?.baseResistanceKg === "number" ? product.baseResistanceKg : loadMeta.baseResistanceKg,
    availablePlatesKg: Array.isArray(product?.availablePlatesKg) && product.availablePlatesKg.length > 0
      ? product.availablePlatesKg
      : loadMeta.availablePlatesKg,
    progressionMode,
    growthPotential,
    adjacentFamilies: ADJACENT_FAMILIES[family] || []
  };
}

export function normalizeWeightForMuscles(weightKg, muscles) {
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }
  const factor = getExerciseLoadFactor(muscles);
  if (!factor) {
    return null;
  }
  return round(weightKg / factor, 1);
}

export function denormalizeWeightForMuscles(loadIndex, muscles) {
  if (typeof loadIndex !== "number" || !Number.isFinite(loadIndex) || loadIndex <= 0) {
    return null;
  }
  const factor = getExerciseLoadFactor(muscles);
  if (!factor) {
    return null;
  }
  return round(loadIndex * factor, 1);
}

export function quantizeSuggestedWeight(weightKg, stepKg) {
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }
  if (!stepKg || stepKg <= 0) {
    return round(weightKg, 1);
  }
  return round(Math.round(weightKg / stepKg) * stepKg, 2);
}

export function buildProgressionHint(profile, suggestedWeightKg) {
  if (!profile) {
    return "";
  }

  if (profile.progressionMode === "duration") {
    return profile.growthPotential === "low"
      ? "Tanca el rang i afegeix 5-10 s abans de complicar la variant."
      : "Tanca el rang i afegeix 10-20 s o una variant més exigent.";
  }

  if (profile.progressionMode === "reps") {
    return profile.growthPotential === "high"
      ? "Tanca el rang alt i desprús afegeix càrrega externa o una variant més dura."
      : "Tanca el rang alt i desprús passa a una variant més exigent.";
  }

  if (profile.loadSystem === "plate_loaded" && typeof suggestedWeightKg === "number") {
    const baseHint = typeof profile.baseResistanceKg === "number" ? ` La palanca base ronda ${profile.baseResistanceKg} kg.` : "";
    return `Si completes totes les series, puja ${formatStep(profile.stepKg)} en discs carregats.${baseHint}`;
  }

  if (profile.loadSystem === "stack" && typeof suggestedWeightKg === "number") {
    return `Si completes totes les series, puja ${formatStep(profile.stepKg)} al seguent pin del stack.`;
  }

  if (typeof suggestedWeightKg === "number" && profile.stepKg > 0) {
    return `Si completes totes les series, puja ${formatStep(profile.stepKg)} al seguent esglaó.`;
  }

  return "Comença conservador i puja d'esglaó quan tanquis el rang amb tècnica neta.";
}

export function labelForFamily(family) {
  const labels = {
    lower_push: "cames",
    lower_posterior: "cadena posterior",
    upper_pull: "tirada superior",
    upper_push: "empenyada superior",
    shoulders: "espatlles",
    arms: "bracos",
    calves: "bessons",
    core: "core",
    cardio: "cardio",
    mixed: "mixt"
  };
  return labels[family] || "mixt";
}

export function labelForLoadSystem(loadSystem) {
  const labels = {
    stack: "stack",
    plate_loaded: "discs",
    free_weight: "pes lliure",
    support: "suport",
    bodyweight: "pes corporal",
    custom: "personalitzat"
  };
  return labels[loadSystem] || "càrrega";
}

export function buildProportionalityMeta(normalizedAveragesByMuscle, normalizedEntries) {
  const scoredMuscles = Object.keys(normalizedAveragesByMuscle || {}).length;
  const entryCount = Array.isArray(normalizedEntries) ? normalizedEntries.length : 0;
  const hasEnoughData = scoredMuscles >= 3 && entryCount >= 4;
  const confidence = scoredMuscles >= 6 && entryCount >= 10
    ? "high"
    : scoredMuscles >= 4 && entryCount >= 6
      ? "medium"
      : "low";

  return {
    scoredMuscles,
    entryCount,
    hasEnoughData,
    confidence
  };
}

function normalizeLoadSystem(loadSystem, equipmentType) {
  if (loadSystem) {
    return loadSystem;
  }
  if (equipmentType === "bodyweight") {
    return "bodyweight";
  }
  if (equipmentType === "free-weight") {
    return "free_weight";
  }
  if (equipmentType === "support" || equipmentType === "custom") {
    return equipmentType;
  }
  return "stack";
}

function defaultStepKg({ loadSystem, family }) {
  if (loadSystem === "bodyweight") {
    return 0;
  }
  if (loadSystem === "plate_loaded") {
    return 5;
  }
  if (loadSystem === "free_weight" || loadSystem === "support" || loadSystem === "custom") {
    if (family === "shoulders" || family === "arms" || family === "core" || family === "calves") {
      return 1.25;
    }
    return 2.5;
  }
  if (family === "lower_push" || family === "lower_posterior") {
    return 5;
  }
  if (family === "upper_pull" || family === "upper_push") {
    return 2.5;
  }
  if (family === "shoulders" || family === "arms" || family === "core" || family === "calves") {
    return 1.25;
  }
  return 2.5;
}

function estimateBaseResistanceKg({ loadSystem, family }) {
  if (loadSystem !== "plate_loaded") {
    return null;
  }
  if (family === "lower_push") {
    return 25;
  }
  if (family === "lower_posterior") {
    return 20;
  }
  if (family === "upper_pull" || family === "upper_push") {
    return 15;
  }
  if (family === "shoulders") {
    return 10;
  }
  if (family === "arms" || family === "calves" || family === "core") {
    return 5;
  }
  return 10;
}

function defaultGrowthPotential(family) {
  if (family === "lower_push" || family === "lower_posterior") {
    return "high";
  }
  if (family === "upper_pull" || family === "upper_push" || family === "shoulders") {
    return "medium";
  }
  return "low";
}

function formatStep(stepKg) {
  return Number.isInteger(stepKg) ? `+${stepKg} kg` : `+${stepKg.toFixed(2).replace(/0$/, "").replace(/\.$/, "")} kg`;
}

function normalizeTextForLoad(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
