import { DURATION_OPTIONS, MUSCLE_GROUPS } from "./config.js";
import { hasSpecificMuscleSelection, matchesSelectedMuscles, selectedMuscleLabels } from "./muscle-ui.js";
import {
  buildProgressionHint,
  buildProgressionProfile,
  buildProportionalityMeta,
  denormalizeWeightForMuscles,
  getMovementFamily,
  getTrackedMuscles,
  normalizeWeightForMuscles,
  quantizeSuggestedWeight
} from "./proportionality.js";

export function createUsageStats(usageEvents, productsById) {
  const stats = {
    total: usageEvents.length,
    byProductId: {},
    lastUsedDays: {},
    byDate: {},
    byMuscleRecent: {},
    lastWeightByProduct: {},
    avgWeightByMuscle: {},
    weightEntriesByMuscle: {},
    avgNormalizedLoadByMuscle: {},
    normalizedLoadEntriesByMuscle: {},
    avgNormalizedLoadByFamily: {},
    normalizedLoadEntriesByFamily: {},
    balanceScoreByMuscle: {},
    proportionalityMeta: {
      scoredMuscles: 0,
      entryCount: 0,
      hasEnoughData: false,
      confidence: "low"
    },
    personalLoadIndex: null
  };
  const normalizedLoads = [];

  const today = startOfDay(new Date());
  const recentLimit = new Date(today);
  recentLimit.setDate(recentLimit.getDate() - 14);

  for (const event of usageEvents) {
    stats.byProductId[event.productId] = (stats.byProductId[event.productId] || 0) + 1;
    stats.byDate[event.dateKey] = (stats.byDate[event.dateKey] || 0) + 1;
    const muscles = event.muscleGroups?.length ? event.muscleGroups : productsById.get(event.productId)?.muscleGroups || [];
    const trackedMuscles = getTrackedMuscles(muscles);
    const family = getMovementFamily(muscles);

    const usedDate = startOfDay(new Date(event.dateKey));
    const diff = Math.floor((today - usedDate) / 86400000);
    const current = stats.lastUsedDays[event.productId];
    if (current === undefined || diff < current) {
      stats.lastUsedDays[event.productId] = diff;
    }

    if (typeof event.weightKg === "number" && !Number.isNaN(event.weightKg) && event.weightKg > 0) {
      trackedMuscles.forEach((muscle) => {
        const bucket = stats.weightEntriesByMuscle[muscle] || [];
        bucket.push(event.weightKg);
        stats.weightEntriesByMuscle[muscle] = bucket;
      });
      const normalizedLoad = normalizeWeightForMuscles(event.weightKg, trackedMuscles);
      if (normalizedLoad !== null) {
        normalizedLoads.push(normalizedLoad);
        const familyBucket = stats.normalizedLoadEntriesByFamily[family] || [];
        familyBucket.push(normalizedLoad);
        stats.normalizedLoadEntriesByFamily[family] = familyBucket;
        trackedMuscles.forEach((muscle) => {
          const bucket = stats.normalizedLoadEntriesByMuscle[muscle] || [];
          bucket.push(normalizedLoad);
          stats.normalizedLoadEntriesByMuscle[muscle] = bucket;
        });
      }
    }

    if (usedDate >= recentLimit) {
      for (const muscle of muscles) {
        if (muscle === "all") {
          continue;
        }
        stats.byMuscleRecent[muscle] = (stats.byMuscleRecent[muscle] || 0) + 1;
      }
    }

    if (typeof event.weightKg === "number" && !Number.isNaN(event.weightKg) && event.weightKg > 0) {
      const currentWeight = stats.lastWeightByProduct[event.productId];
      if (!currentWeight || new Date(event.createdAt) > new Date(currentWeight.createdAt)) {
        stats.lastWeightByProduct[event.productId] = { weightKg: event.weightKg, createdAt: event.createdAt };
      }
    }
  }

  for (const [muscle, entries] of Object.entries(stats.weightEntriesByMuscle)) {
    stats.avgWeightByMuscle[muscle] = round(entries.reduce((sum, value) => sum + value, 0) / entries.length, 1);
  }

  for (const [muscle, entries] of Object.entries(stats.normalizedLoadEntriesByMuscle)) {
    stats.avgNormalizedLoadByMuscle[muscle] = round(entries.reduce((sum, value) => sum + value, 0) / entries.length, 1);
  }

  for (const [family, entries] of Object.entries(stats.normalizedLoadEntriesByFamily)) {
    stats.avgNormalizedLoadByFamily[family] = round(entries.reduce((sum, value) => sum + value, 0) / entries.length, 1);
  }

  if (normalizedLoads.length > 0) {
    stats.personalLoadIndex = round(normalizedLoads.reduce((sum, value) => sum + value, 0) / normalizedLoads.length, 1);
  }

  const normalizedAverages = Object.values(stats.avgNormalizedLoadByMuscle);
  if (normalizedAverages.length > 0) {
    const min = Math.min(...normalizedAverages);
    const max = Math.max(...normalizedAverages);
    for (const [muscle, average] of Object.entries(stats.avgNormalizedLoadByMuscle)) {
      stats.balanceScoreByMuscle[muscle] = max === min ? 1 : round((average - min) / (max - min), 2);
    }
  }

  stats.proportionalityMeta = buildProportionalityMeta(stats.avgNormalizedLoadByMuscle, normalizedLoads);

  return stats;
}

export function getVisibleProducts(products, machinePrefs) {
  return products.filter((product) => machinePrefs[product.id]?.availability !== "hidden");
}

export function getHiddenProducts(products, machinePrefs) {
  return products.filter((product) => machinePrefs[product.id]?.availability === "hidden");
}

export function filterProducts(products, state, machinePrefs) {
  let visible = getVisibleProducts(products, machinePrefs);

  if (state.selectedBrand !== "all") {
    visible = visible.filter((product) => product.providerId === state.selectedBrand);
  }

  if (hasSpecificMuscleSelection(state.selectedMuscle)) {
    visible = visible.filter((product) => matchesSelectedMuscles(product.muscleGroups, state.selectedMuscle));
  }

  if (state.selectedEquipmentType !== "all") {
    visible = visible.filter((product) => product.equipmentType === state.selectedEquipmentType);
  }

  if (state.searchQuery) {
    visible = visible.filter((product) => product.searchText.includes(state.searchQuery));
  }

  return visible.sort((left, right) => compareProducts(left, right, state));
}

export function compareProducts(left, right, state) {
  if (state.selectedSort === "title") {
    return left.title.localeCompare(right.title, "ca");
  }
  if (state.selectedSort === "series") {
    return left.series.localeCompare(right.series, "ca") || left.title.localeCompare(right.title, "ca");
  }
  return right.recommendationScore - left.recommendationScore || left.title.localeCompare(right.title, "ca");
}

export function decorateRecommendations(products, state, usageStats) {
  return products.map((product) => ({
    ...product,
    recommendationScore: recommendationScore(product, state, usageStats),
    recommendationReason: buildReason(product, state, usageStats)
  }));
}

export function buildRoutine(products, state, usageStats) {
  const duration = DURATION_OPTIONS.find((option) => Number(option.value) === Number(state.selectedDuration)) || DURATION_OPTIONS[1];
  const candidates = [...products].sort((left, right) => right.recommendationScore - left.recommendationScore);
  const selected = [];
  const selectedIds = new Set();
  const musclesCovered = new Set();

  for (const product of candidates) {
    const addsNewMuscle = product.muscleGroups.some((muscle) => muscle !== "all" && !musclesCovered.has(muscle));
    if (selected.length < duration.exerciseCount && (addsNewMuscle || selected.length < Math.ceil(duration.exerciseCount / 2))) {
      selected.push({
        ...product,
        prescription: suggestPrescription(product, duration.value, state.selectedObjective),
        suggestedWeightKg: suggestWeight(product, usageStats),
        progressionHint: suggestProgression(product, usageStats)
      });
      selectedIds.add(product.id);
      product.muscleGroups.forEach((muscle) => musclesCovered.add(muscle));
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= duration.exerciseCount) {
      break;
    }
    if (selectedIds.has(candidate.id)) {
      continue;
    }
    selected.push({
      ...candidate,
      prescription: suggestPrescription(candidate, duration.value, state.selectedObjective),
      suggestedWeightKg: suggestWeight(candidate, usageStats),
      progressionHint: suggestProgression(candidate, usageStats)
    });
    selectedIds.add(candidate.id);
  }

  const explanation = routineExplanationCompact(state, usageStats);

  return {
    duration,
    exercises: selected,
    explanation
  };
}

function recommendationScore(product, state, usageStats) {
  let score = 0;
  const lastUsed = usageStats.lastUsedDays[product.id];
  const usageCount = usageStats.byProductId[product.id] || 0;

  if (hasSpecificMuscleSelection(state.selectedMuscle) && matchesSelectedMuscles(product.muscleGroups, state.selectedMuscle)) {
    score += 8;
  }
  if (!hasSpecificMuscleSelection(state.selectedMuscle) && product.muscleGroups.some((muscle) => isUndertrained(muscle, usageStats))) {
    score += 5;
  }
  if (usageCount > 0) {
    score += 2;
  }
  if (lastUsed === undefined) {
    score += 3;
  } else if (lastUsed <= 1) {
    score -= 6;
  } else if (lastUsed <= 4) {
    score -= 3;
  } else if (lastUsed >= 10) {
    score += 3;
  }
  if (product.equipmentType === "machine") {
    score += 1;
  }
  if (product.equipmentType === "bodyweight" && state.selectedEquipmentType === "bodyweight") {
    score += 4;
  }
  if (product.equipmentType === "bodyweight" && state.selectedEquipmentType === "all") {
    score += 1;
  }
  if (product.collections.some((collection) => ["Musculacio", "Diamond", "Hela", "Frey", "Iron Force"].includes(collection))) {
    score += 2;
  }

  return score;
}

function buildReason(product, state, usageStats) {
  if (hasSpecificMuscleSelection(state.selectedMuscle) && matchesSelectedMuscles(product.muscleGroups, state.selectedMuscle)) {
    const labels = selectedMuscleLabels(state.selectedMuscle);
    if (labels.length === 1) {
      return "Coincideix amb la zona del cos que has triat.";
    }
    return `Coincideix amb ${labels.join(" / ")}.`;
  }

  const laggingByRelativeLoad = product.muscleGroups
    .filter((muscle) => typeof usageStats.balanceScoreByMuscle[muscle] === "number" && usageStats.balanceScoreByMuscle[muscle] < 0.45)
    .map((muscle) => MUSCLE_GROUPS.find((entry) => entry.id === muscle)?.label?.toLowerCase())
    .filter(Boolean);

  if (laggingByRelativeLoad.length > 0) {
    return `Ajuda a compensar la carrega relativa de ${laggingByRelativeLoad.join(" i ")}.`;
  }

  const lastUsed = usageStats.lastUsedDays[product.id];
  if (lastUsed === undefined) {
    return "Encara no apareix al teu historic i ajuda a ampliar varietat.";
  }
  if (lastUsed >= 10) {
    return "Fa dies que no la treballes i va be per reactivar-la.";
  }
  return "Es mante equilibrada respecte al teu historic recent.";
}

function suggestPrescription(product, duration, objective) {
  const profile = buildProgressionProfile(product);
  const family = profile.family;
  const growthPotential = profile.growthPotential;
  const stepBand = getLoadStepBand(profile.stepKg);
  const compoundFamily = family === "lower_push" || family === "lower_posterior" || family === "upper_push" || family === "upper_pull";

  if (profile.progressionMode === "duration") {
    if (objective === "strength") {
      return family === "cardio" ? "8-12 min intensos" : "3-4 series x 25-45 s";
    }
    if (objective === "fat-loss") {
      return family === "cardio" ? "15-22 min en intervals" : "3-5 series x 30-45 s";
    }
    if (objective === "endurance") {
      return family === "cardio" ? "18-25 min sostinguts" : "3-4 series x 30-60 s";
    }
    return family === "cardio" ? "10-18 min progressius" : "3 series x 20-45 s";
  }

  if (objective === "strength") {
    if (stepBand === "coarse") {
      if (growthPotential === "high") {
        return "4-5 series x 5-8 rep";
      }
      return compoundFamily ? "4 series x 5-7 rep" : "3-4 series x 6-9 rep";
    }
    if (stepBand === "fine") {
      if (growthPotential === "high") {
        return "4-5 series x 4-6 rep";
      }
      if (growthPotential === "medium") {
        return "4 series x 5-7 rep";
      }
      return "3-4 series x 6-8 rep";
    }
    if (growthPotential === "high") {
      return "4-5 series x 4-7 rep";
    }
    if (growthPotential === "medium") {
      return "4 series x 5-8 rep";
    }
    return "3-4 series x 6-9 rep";
  }
  if (objective === "toning") {
    if (stepBand === "coarse") {
      return growthPotential === "high" ? "3-4 series x 10-15 rep" : "3-4 series x 12-18 rep";
    }
    return growthPotential === "high" ? "3-4 series x 10-14 rep" : "3-4 series x 12-16 rep";
  }
  if (objective === "fat-loss") {
    if (stepBand === "coarse") {
      return growthPotential === "high" ? "3-4 series x 12-18 rep amb descans curt" : "3-4 series x 14-20 rep amb descans curt";
    }
    return growthPotential === "high" ? "3-4 series x 12-16 rep amb descans curt" : "3-4 series x 12-18 rep amb descans curt";
  }
  if (objective === "endurance") {
    if (stepBand === "coarse") {
      return growthPotential === "high" ? "2-4 series x 14-20 rep" : "2-4 series x 16-22 rep";
    }
    return growthPotential === "high" ? "2-4 series x 12-18 rep" : "2-4 series x 15-20 rep";
  }
  if (objective === "mobility") {
    return "2-3 series x 6-12 rep controlades";
  }
  if (objective === "recovery") {
    return "2-3 series x 10-15 rep amb marge";
  }
  if (objective === "quick") {
    if (stepBand === "coarse") {
      return growthPotential === "high" ? "2-3 series x 8-12 rep" : "2-3 series x 10-14 rep";
    }
    return growthPotential === "high" ? "2-3 series x 8-10 rep" : "2-3 series x 10-12 rep";
  }
  if (growthPotential === "high") {
    if (stepBand === "coarse") {
      return duration <= 20 ? "3 series x 8-12 rep" : "4 series x 8-12 rep";
    }
    return duration <= 20 ? "3 series x 8-10 rep" : "4 series x 6-10 rep";
  }
  if (growthPotential === "medium") {
    return duration <= 20 ? "3 series x 8-12 rep" : "3-4 series x 8-12 rep";
  }
  return duration <= 20 ? "2-3 series x 10-14 rep" : "3-4 series x 10-15 rep";
}

function routineExplanation(state, usageStats) {
  const objectiveLabel = state.selectedObjective === "strength"
    ? "forca"
    : state.selectedObjective === "toning"
      ? "tonificacio"
      : state.selectedObjective === "fat-loss"
        ? "perdua de greix"
    : state.selectedObjective === "endurance"
      ? "resistencia"
      : state.selectedObjective === "mobility"
        ? "mobilitat"
      : state.selectedObjective === "recovery"
        ? "tecnica i recuperacio"
        : state.selectedObjective === "quick"
          ? "rutina rapida"
        : "hipertrofia";

  const selectedLabels = selectedMuscleLabels(state.selectedMuscle);
  if (selectedLabels.length > 0) {
    return `${objectiveLabel} per ${selectedLabels.join(" + ")}.`;
  }

  const weakest = Object.entries(usageStats.byMuscleRecent)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 2)
    .map(([muscle]) => MUSCLE_GROUPS.find((entry) => entry.id === muscle)?.label?.toLowerCase())
    .filter(Boolean);

  if (weakest.length > 0) {
    return `${objectiveLabel} per compensar ${weakest.join(" + ")}.`;
  }

  return `Rutina general de ${objectiveLabel} per començar a construir historic i adaptar futures recomanacions.`;
}

function routineExplanationCompact(state, usageStats) {
  const objectiveLabel = state.selectedObjective === "strength"
    ? "forca"
    : state.selectedObjective === "toning"
      ? "tonificacio"
      : state.selectedObjective === "fat-loss"
        ? "perdua de greix"
        : state.selectedObjective === "endurance"
          ? "resistencia"
          : state.selectedObjective === "mobility"
            ? "mobilitat"
            : state.selectedObjective === "recovery"
              ? "tecnica"
              : state.selectedObjective === "quick"
                ? "rapid"
                : "hipertrofia";

  const selectedLabels = selectedMuscleLabels(state.selectedMuscle);
  if (selectedLabels.length > 0) {
    return `${objectiveLabel} per ${selectedLabels.join(" + ")}.`;
  }

  const weakest = Object.entries(usageStats.byMuscleRecent)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 2)
    .map(([muscle]) => MUSCLE_GROUPS.find((entry) => entry.id === muscle)?.label?.toLowerCase())
    .filter(Boolean);

  if (weakest.length > 0) {
    return `${objectiveLabel} per compensar ${weakest.join(" + ")}.`;
  }

  return `${objectiveLabel} general per avui.`;
}

function suggestWeight(product, usageStats) {
  const lastWeight = usageStats.lastWeightByProduct[product.id]?.weightKg;
  const profile = buildProgressionProfile(product);
  if (typeof lastWeight === "number") {
    return quantizeSuggestedWeight(lastWeight, profile.stepKg);
  }

  const trackedMuscles = getTrackedMuscles(product.muscleGroups);
  const normalizedAverages = trackedMuscles
    .map((muscle) => usageStats.avgNormalizedLoadByMuscle[muscle])
    .filter((value) => typeof value === "number");

  if (normalizedAverages.length > 0) {
    const normalizedIndex = round(normalizedAverages.reduce((sum, value) => sum + value, 0) / normalizedAverages.length, 1);
    return quantizeSuggestedWeight(denormalizeWeightForMuscles(normalizedIndex, trackedMuscles), profile.stepKg);
  }

  const familyAverage = usageStats.avgNormalizedLoadByFamily[profile.family];
  if (typeof familyAverage === "number") {
    return quantizeSuggestedWeight(denormalizeWeightForMuscles(familyAverage, trackedMuscles), profile.stepKg);
  }

  const adjacentValues = profile.adjacentFamilies
    .map((family) => usageStats.avgNormalizedLoadByFamily[family])
    .filter((value) => typeof value === "number");

  if (adjacentValues.length >= 1 && usageStats.proportionalityMeta?.confidence !== "low") {
    const adjacentAverage = round(adjacentValues.reduce((sum, value) => sum + value, 0) / adjacentValues.length, 1);
    return quantizeSuggestedWeight(denormalizeWeightForMuscles(adjacentAverage, trackedMuscles), profile.stepKg);
  }

  if (typeof usageStats.personalLoadIndex === "number" && usageStats.proportionalityMeta?.entryCount >= 2) {
    return quantizeSuggestedWeight(denormalizeWeightForMuscles(usageStats.personalLoadIndex, trackedMuscles), profile.stepKg);
  }

  return null;
}

function suggestProgression(product, usageStats) {
  const profile = buildProgressionProfile(product);
  const suggestedWeightKg = suggestWeight(product, usageStats);
  return buildProgressionHint(profile, suggestedWeightKg);
}

function isUndertrained(muscle, usageStats) {
  if (!muscle || muscle === "all") {
    return false;
  }
  const values = Object.values(usageStats.byMuscleRecent);
  if (values.length === 0) {
    return true;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const frequencyUnder = (usageStats.byMuscleRecent[muscle] || 0) <= average;
  const balanceUnder = typeof usageStats.balanceScoreByMuscle[muscle] === "number"
    ? usageStats.balanceScoreByMuscle[muscle] < 0.45
    : false;
  return frequencyUnder || balanceUnder;
}

export function buildCalendarDays(usageStats) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((offset + last.getDate()) / 7) * 7;
  const days = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - offset + 1;
    if (dayNumber < 1 || dayNumber > last.getDate()) {
      days.push({ empty: true });
      continue;
    }
    const date = new Date(year, month, dayNumber);
    const dateKey = getLocalDateKey(date);
    const count = usageStats.byDate[dateKey] || 0;
    days.push({
      empty: false,
      dayNumber,
      dateKey,
      count
    });
  }

  return {
    title: today.toLocaleString("ca-ES", { month: "long", year: "numeric" }),
    days
  };
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getLoadStepBand(stepKg) {
  if (!stepKg || stepKg <= 0) {
    return "bodyweight";
  }
  if (stepKg >= 5) {
    return "coarse";
  }
  if (stepKg <= 1.25) {
    return "fine";
  }
  return "medium";
}
