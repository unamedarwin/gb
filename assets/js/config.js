export const APP_NAME = "GymBro's";
export const IMAGE_CACHE = "gymbros-images-v1";
export const SYNC_VERSION = "2026-07-06";
export const CLIENT_SCHEMA_VERSION = 5;

export const DB_NAME = "gymbros";
export const DB_VERSION = 4;
export const PRODUCT_STORE = "products";
export const META_STORE = "meta";
export const PREF_STORE = "machinePrefs";
export const USAGE_STORE = "usageEvents";
export const SESSION_STORE = "sessions";
export const CUSTOM_EXERCISE_STORE = "customExercises";
export const ROUTINE_DAY_STORE = "routineDays";

export const CATALOG_PROVIDERS = [
  {
    id: "fh",
    label: "F&H Fitness",
    baseUrl: "https://fyhfitness.com",
    collections: [
      { handle: "musculacion", label: "Musculació", equipmentType: "machine", family: "strength" },
      { handle: "hela", label: "Hela", equipmentType: "machine", family: "strength" },
      { handle: "fred", label: "Frey", equipmentType: "machine", family: "strength" },
      { handle: "diamond", label: "Diamond", equipmentType: "machine", family: "strength" },
      { handle: "iron-force-2022", label: "Iron Force", equipmentType: "machine", family: "strength" },
      { handle: "master-coach", label: "Master Coach", equipmentType: "support", family: "strength" },
      { handle: "cardio", label: "Cardio", equipmentType: "machine", family: "cardio" },
      { handle: "fast-line", label: "Fast Line", equipmentType: "machine", family: "cardio" },
      { handle: "one", label: "One", equipmentType: "machine", family: "cardio" },
      { handle: "eros", label: "Eros", equipmentType: "machine", family: "cardio" },
      { handle: "aqua", label: "Aqua", equipmentType: "machine", family: "cardio" },
      { handle: "aton", label: "Aton", equipmentType: "machine", family: "cardio" },
      { handle: "cintas-de-correr", label: "Cintes", equipmentType: "machine", family: "cardio" },
      { handle: "bicicletas-indoor", label: "Bicicletes", equipmentType: "machine", family: "cardio" },
      { handle: "estaciones-de-entrenamiento", label: "Estacions", equipmentType: "support", family: "strength" },
      { handle: "jaulas", label: "Jaules", equipmentType: "support", family: "strength" },
      { handle: "bancos", label: "Bancs", equipmentType: "support", family: "strength" },
      { handle: "mancuernas", label: "Mancuernes", equipmentType: "free-weight", family: "free-weight" },
      { handle: "barras", label: "Barres", equipmentType: "free-weight", family: "free-weight" },
      { handle: "discos", label: "Discos", equipmentType: "free-weight", family: "free-weight" }
    ]
  }
];

export const MUSCLE_GROUPS = [
  { id: "all", label: "Tot el cos" },
  { id: "chest", label: "Pit" },
  { id: "back", label: "Esquena" },
  { id: "shoulders", label: "Espatlles" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "legs", label: "Cames / quadriceps" },
  { id: "hamstrings", label: "Isquios" },
  { id: "glutes", label: "Glutis" },
  { id: "calves", label: "Bessons" },
  { id: "core", label: "Core" },
  { id: "cardio", label: "Cardio" }
];

export const CHECKLIST_MUSCLE_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "hamstrings", "glutes", "calves", "core"];

export const MUSCLE_PROPORTIONALITY = {
  chest: 0.75,
  back: 0.8,
  shoulders: 0.6,
  biceps: 0.4,
  triceps: 0.45,
  legs: 1,
  hamstrings: 0.9,
  glutes: 0.95,
  calves: 0.55,
  core: 0.35
};

export const ROUTINE_DAY_OPTIONS = [
  { id: "A", label: "Dia A" },
  { id: "B", label: "Dia B" },
  { id: "C", label: "Dia C" },
  { id: "monday", label: "Dilluns" },
  { id: "tuesday", label: "Dimarts" },
  { id: "wednesday", label: "Dimecres" },
  { id: "thursday", label: "Dijous" },
  { id: "friday", label: "Divendres" },
  { id: "saturday", label: "Dissabte" },
  { id: "sunday", label: "Diumenge" }
];

export const DURATION_OPTIONS = [
  { value: 20, label: "20 min", exerciseCount: 3 },
  { value: 40, label: "40 min", exerciseCount: 5 },
  { value: 60, label: "60 min", exerciseCount: 7 },
  { value: 90, label: "90 min", exerciseCount: 9 }
];

export const OBJECTIVE_OPTIONS = [
  { id: "hypertrophy", label: "Hipertrofia" },
  { id: "strength", label: "Força" },
  { id: "toning", label: "Tonificacio" },
  { id: "fat-loss", label: "Perdua de greix" },
  { id: "endurance", label: "Resistencia" },
  { id: "mobility", label: "Mobilitat" },
  { id: "recovery", label: "Tècnica / recuperació" },
  { id: "quick", label: "Rutina ràpida" }
];

export const MUSCLE_RULES = {
  chest: ["chest", "chest press", "bench press", "incline press", "decline press", "pec", "pec fly", "pecfly", "butterfly", "fly", "cable crossover", "crossover", "press de pit"],
  back: ["row", "rowing", "remo", "lat", "pull down", "pulldown", "pull-over", "pullover", "low row", "high row", "seated row", "horizontal pulley", "pulley", "t arm", "t-arm", "t bar", "t-bar", "draw muscle", "lower back", "back extension"],
  shoulders: ["shoulder", "deltoid", "lateral raise", "rear delt", "shoulder press", "military press", "press militar", "overhead press"],
  biceps: ["bicep", "biceps", "biceps curl", "arm curl", "forearm", "preacher", "curl scott"],
  triceps: ["tricep", "triceps", "triceps extension", "pushdown", "dip", "fondos"],
  legs: ["leg press", "leg extension", "90 degree leg", "quadriceps", "cuadriceps", "squat", "prensa", "hack squat", "hack", "sentadilla", "adductor", "abductor"],
  hamstrings: ["hamstring", "isquio", "femoral", "leg curl", "curl femoral", "romanian deadlift", "rdl"],
  glutes: ["glute", "glutis", "kick back", "hip thrust", "multi hip", "multi-hip", "gluteus", "booty builder", "bridge"],
  calves: ["calf", "besso", "gemelo", "gastroc", "soleus"],
  core: ["abdominal", "abs", "crunch", "core", "torso", "twist", "rotary", "plank", "roman chair", "knee raise"],
  cardio: ["treadmill", "bike", "bicycle", "elliptical", "air bike", "rower", "spinning", "cardio", "cinta", "bicicleta", "remo concept"]
};
