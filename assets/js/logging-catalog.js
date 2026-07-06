export function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildLoggableExerciseContexts({ bodyweightContexts, visibleProductContexts, customExercises, routineDays }) {
  const map = new Map();
  const add = (context) => {
    const key = normalizeLookupText(context.title);
    if (key && !map.has(key)) {
      map.set(key, context);
    }
  };

  bodyweightContexts.forEach(add);
  visibleProductContexts.forEach(add);
  customExercises.forEach((exercise) => add({
    productId: `custom:${exercise.id}`,
    exerciseId: exercise.id,
    title: exercise.name,
    muscleGroups: [exercise.primaryMuscle, ...(exercise.secondaryMuscles || [])],
    equipmentType: "custom",
    sourceType: "custom",
    defaultSets: exercise.sets || "",
    defaultReps: exercise.reps || "",
    defaultNotes: exercise.notes || "",
    defaultWeightKg: typeof exercise.weightKg === "number" ? exercise.weightKg : null
  }));
  routineDays.forEach((day) => {
    day.entries.forEach((entry) => add({
      productId: `routine:${day.id}:${entry.id}`,
      exerciseId: entry.exerciseId || entry.id,
      title: entry.title,
      muscleGroups: entry.muscleGroups || [],
      equipmentType: "custom",
      sourceType: "planner",
      defaultSets: entry.sets || "",
      defaultReps: entry.reps || "",
      defaultNotes: entry.notes || "",
      defaultWeightKg: typeof entry.weightKg === "number" ? entry.weightKg : null
    }));
  });

  return Array.from(map.values()).sort((left, right) => left.title.localeCompare(right.title, "ca"));
}

export function resolveLogContextFromInput(contexts, inputValue) {
  const normalized = normalizeLookupText(inputValue);
  if (!normalized) {
    return null;
  }

  const exact = contexts.find((context) => normalizeLookupText(context.title) === normalized);
  if (exact) {
    return exact;
  }

  const prefixMatches = contexts.filter((context) => normalizeLookupText(context.title).startsWith(normalized));
  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }

  const partialMatches = contexts.filter((context) => normalizeLookupText(context.title).includes(normalized));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  return null;
}
