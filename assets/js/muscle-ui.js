import { CHECKLIST_MUSCLE_GROUPS, MUSCLE_GROUPS } from "./config.js";

const PRIMARY_MUSCLE_RANK = ["chest", "back", "shoulders", "legs", "hamstrings", "glutes", "calves", "core", "biceps", "triceps", "cardio"];

const MUSCLE_ZONE_MAP = {
  all: ["shoulders-front", "chest", "biceps-front", "core", "legs-front", "calves-front", "shoulders-back", "back", "triceps-back", "glutes", "hamstrings", "calves-back"],
  chest: ["chest"],
  back: ["back", "shoulders-back"],
  shoulders: ["shoulders-front", "shoulders-back"],
  biceps: ["biceps-front"],
  triceps: ["triceps-back"],
  core: ["core"],
  legs: ["legs-front"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves-front", "calves-back"],
  cardio: ["legs-front", "calves-front", "back"]
};

export function normalizeSelectedMuscleState(selection = ["all"]) {
  const values = Array.isArray(selection) ? selection : [selection];
  const cleaned = values.filter(Boolean);
  if (cleaned.length === 0 || cleaned.includes("all")) {
    return ["all"];
  }
  return Array.from(new Set(cleaned));
}

export function getSelectedMuscleIds(selection = ["all"]) {
  return normalizeSelectedMuscleState(selection).filter((muscleId) => muscleId !== "all");
}

export function hasSpecificMuscleSelection(selection = ["all"]) {
  return getSelectedMuscleIds(selection).length > 0;
}

export function isMuscleFilterActive(selection = ["all"], muscleId) {
  const normalized = normalizeSelectedMuscleState(selection);
  return muscleId === "all" ? normalized.includes("all") : normalized.includes(muscleId);
}

export function toggleSelectedMuscleSelection(selection = ["all"], muscleId) {
  if (muscleId === "all") {
    return ["all"];
  }

  const active = new Set(getSelectedMuscleIds(selection));
  if (active.has(muscleId)) {
    active.delete(muscleId);
  } else {
    active.add(muscleId);
  }
  return active.size > 0 ? Array.from(active) : ["all"];
}

export function matchesSelectedMuscles(muscleGroups, selection = ["all"]) {
  const selected = getSelectedMuscleIds(selection);
  if (selected.length === 0) {
    return true;
  }
  const groups = muscleGroups || [];
  return groups.includes("all") || selected.some((muscleId) => groups.includes(muscleId));
}

export function labelForMuscle(muscle) {
  return MUSCLE_GROUPS.find((item) => item.id === muscle)?.label || "General";
}

export function selectedMuscleLabels(selection = ["all"]) {
  return getSelectedMuscleIds(selection)
    .map((muscleId) => labelForMuscle(muscleId).toLowerCase())
    .filter(Boolean);
}

export function selectedMuscleFilterLabel(selection = ["all"]) {
  const selected = getSelectedMuscleIds(selection);
  if (selected.length === 0) {
    return "Tot el cos";
  }
  if (selected.length === 1) {
    return labelForMuscle(selected[0]);
  }
  if (selected.length === 2) {
    return `${labelForMuscle(selected[0])} + ${labelForMuscle(selected[1]).toLowerCase()}`;
  }
  return `${selected.length} zones`;
}

export function selectedMuscleFilterCopy(selection = ["all"]) {
  const selected = getSelectedMuscleIds(selection);
  if (selected.length === 0) {
    return "Vista general per construir la sessio.";
  }
  if (selected.length <= 3) {
    return selected.map((muscleId) => labelForMuscle(muscleId).toLowerCase()).join(" / ");
  }
  return "Les propostes combinen aquestes zones.";
}

export function pickPrimaryMuscle(muscleGroups) {
  return PRIMARY_MUSCLE_RANK.find((muscle) => muscleGroups?.includes(muscle)) || muscleGroups?.[0] || "all";
}

export function musclesForVisualFocus(muscles) {
  const selected = new Set();
  (muscles || []).forEach((muscle) => {
    if (!muscle || muscle === "all") {
      CHECKLIST_MUSCLE_GROUPS.forEach((entry) => selected.add(entry));
      return;
    }
    if (muscle === "cardio") {
      ["legs", "glutes", "calves", "back", "core"].forEach((entry) => selected.add(entry));
      return;
    }
    selected.add(muscle);
  });
  return Array.from(selected);
}

export function buildMuscleAvatarMarkup(primaryMuscle, muscleGroups) {
  const activeZones = new Set(zonesForMuscles([primaryMuscle, ...(muscleGroups || []).slice(1, 3)]));
  return `
    <svg class="muscle-avatar" viewBox="0 0 120 78" role="img" aria-hidden="true" focusable="false">
      <g class="muscle-avatar__figure muscle-avatar__figure--front">
        <circle class="avatar-base" cx="28" cy="10" r="6"></circle>
        <rect class="avatar-base" x="22" y="18" width="12" height="22" rx="6"></rect>
        <rect class="avatar-base" x="15" y="20" width="5" height="21" rx="2.5"></rect>
        <rect class="avatar-base" x="36" y="20" width="5" height="21" rx="2.5"></rect>
        <rect class="avatar-base" x="22" y="40" width="5" height="26" rx="2.5"></rect>
        <rect class="avatar-base" x="29" y="40" width="5" height="26" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("shoulders-front") ? "avatar-zone--active" : ""}" x="18" y="17" width="20" height="8" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("chest") ? "avatar-zone--active" : ""}" x="21" y="23" width="14" height="8" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("biceps-front") ? "avatar-zone--active" : ""}" x="14" y="22" width="5" height="12" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("biceps-front") ? "avatar-zone--active" : ""}" x="37" y="22" width="5" height="12" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("core") ? "avatar-zone--active" : ""}" x="24" y="31" width="8" height="11" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("legs-front") ? "avatar-zone--active" : ""}" x="21" y="42" width="6" height="14" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("legs-front") ? "avatar-zone--active" : ""}" x="29" y="42" width="6" height="14" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("calves-front") ? "avatar-zone--active" : ""}" x="21" y="56" width="6" height="10" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("calves-front") ? "avatar-zone--active" : ""}" x="29" y="56" width="6" height="10" rx="3"></rect>
      </g>
      <g class="muscle-avatar__figure muscle-avatar__figure--back">
        <circle class="avatar-base" cx="88" cy="10" r="6"></circle>
        <rect class="avatar-base" x="82" y="18" width="12" height="22" rx="6"></rect>
        <rect class="avatar-base" x="75" y="20" width="5" height="21" rx="2.5"></rect>
        <rect class="avatar-base" x="96" y="20" width="5" height="21" rx="2.5"></rect>
        <rect class="avatar-base" x="82" y="40" width="5" height="26" rx="2.5"></rect>
        <rect class="avatar-base" x="89" y="40" width="5" height="26" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("shoulders-back") ? "avatar-zone--active" : ""}" x="78" y="17" width="20" height="8" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("back") ? "avatar-zone--active" : ""}" x="81" y="23" width="14" height="12" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("triceps-back") ? "avatar-zone--active" : ""}" x="74" y="22" width="5" height="12" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("triceps-back") ? "avatar-zone--active" : ""}" x="97" y="22" width="5" height="12" rx="2.5"></rect>
        <rect class="avatar-zone ${activeZones.has("glutes") ? "avatar-zone--active" : ""}" x="82" y="36" width="12" height="8" rx="4"></rect>
        <rect class="avatar-zone ${activeZones.has("hamstrings") ? "avatar-zone--active" : ""}" x="81" y="43" width="6" height="14" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("hamstrings") ? "avatar-zone--active" : ""}" x="89" y="43" width="6" height="14" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("calves-back") ? "avatar-zone--active" : ""}" x="81" y="57" width="6" height="9" rx="3"></rect>
        <rect class="avatar-zone ${activeZones.has("calves-back") ? "avatar-zone--active" : ""}" x="89" y="57" width="6" height="9" rx="3"></rect>
      </g>
    </svg>
  `;
}

export function buildFocusAvatarMarkup(muscles, primaryMuscle, tone = "accent") {
  const activeZones = new Set(zonesForMuscles(muscles?.length ? muscles : [primaryMuscle || "all"]));
  const toneClass = tone === "success"
    ? "muscle-avatar--success"
    : tone === "pending"
      ? "muscle-avatar--pending"
      : tone === "neutral"
        ? "muscle-avatar--neutral"
        : "muscle-avatar--accent";
  return `
    <div class="muscle-avatar-frame ${toneClass}">
      <svg class="muscle-avatar muscle-avatar--focus" viewBox="0 0 120 78" role="img" aria-hidden="true" focusable="false">
        <g class="muscle-avatar__figure muscle-avatar__figure--front">
          <circle class="avatar-base" cx="28" cy="10" r="6"></circle>
          <rect class="avatar-base" x="22" y="18" width="12" height="22" rx="6"></rect>
          <rect class="avatar-base" x="15" y="20" width="5" height="21" rx="2.5"></rect>
          <rect class="avatar-base" x="36" y="20" width="5" height="21" rx="2.5"></rect>
          <rect class="avatar-base" x="22" y="40" width="5" height="26" rx="2.5"></rect>
          <rect class="avatar-base" x="29" y="40" width="5" height="26" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("shoulders-front") ? "avatar-zone--active" : ""}" x="18" y="17" width="20" height="8" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("chest") ? "avatar-zone--active" : ""}" x="21" y="23" width="14" height="8" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("biceps-front") ? "avatar-zone--active" : ""}" x="14" y="22" width="5" height="12" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("biceps-front") ? "avatar-zone--active" : ""}" x="37" y="22" width="5" height="12" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("core") ? "avatar-zone--active" : ""}" x="24" y="31" width="8" height="11" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("legs-front") ? "avatar-zone--active" : ""}" x="21" y="42" width="6" height="14" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("legs-front") ? "avatar-zone--active" : ""}" x="29" y="42" width="6" height="14" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("calves-front") ? "avatar-zone--active" : ""}" x="21" y="56" width="6" height="10" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("calves-front") ? "avatar-zone--active" : ""}" x="29" y="56" width="6" height="10" rx="3"></rect>
        </g>
        <g class="muscle-avatar__figure muscle-avatar__figure--back">
          <circle class="avatar-base" cx="88" cy="10" r="6"></circle>
          <rect class="avatar-base" x="82" y="18" width="12" height="22" rx="6"></rect>
          <rect class="avatar-base" x="75" y="20" width="5" height="21" rx="2.5"></rect>
          <rect class="avatar-base" x="96" y="20" width="5" height="21" rx="2.5"></rect>
          <rect class="avatar-base" x="82" y="40" width="5" height="26" rx="2.5"></rect>
          <rect class="avatar-base" x="89" y="40" width="5" height="26" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("shoulders-back") ? "avatar-zone--active" : ""}" x="78" y="17" width="20" height="8" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("back") ? "avatar-zone--active" : ""}" x="81" y="23" width="14" height="12" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("triceps-back") ? "avatar-zone--active" : ""}" x="74" y="22" width="5" height="12" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("triceps-back") ? "avatar-zone--active" : ""}" x="97" y="22" width="5" height="12" rx="2.5"></rect>
          <rect class="avatar-zone ${activeZones.has("glutes") ? "avatar-zone--active" : ""}" x="82" y="36" width="12" height="8" rx="4"></rect>
          <rect class="avatar-zone ${activeZones.has("hamstrings") ? "avatar-zone--active" : ""}" x="81" y="43" width="6" height="14" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("hamstrings") ? "avatar-zone--active" : ""}" x="89" y="43" width="6" height="14" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("calves-back") ? "avatar-zone--active" : ""}" x="81" y="57" width="6" height="9" rx="3"></rect>
          <rect class="avatar-zone ${activeZones.has("calves-back") ? "avatar-zone--active" : ""}" x="89" y="57" width="6" height="9" rx="3"></rect>
        </g>
      </svg>
    </div>
  `;
}

export function zonesForMuscles(muscles = []) {
  return muscles.flatMap((muscle) => MUSCLE_ZONE_MAP[muscle] || []);
}
