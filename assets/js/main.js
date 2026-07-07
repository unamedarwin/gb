import { APP_NAME, CATALOG_PROVIDERS, CHECKLIST_MUSCLE_GROUPS, DURATION_OPTIONS, IMAGE_CACHE, MUSCLE_GROUPS, OBJECTIVE_OPTIONS, ROUTINE_DAY_OPTIONS, SYNC_VERSION } from "./config.js";
import { BODYWEIGHT_EXERCISES } from "./bodyweight-library.js";
import { fetchCatalogWithProgress, fetchProductInstructionSheet } from "./catalog.js";
import {
  buildGuidedPlan,
  buildGuidedPlanCardFragment,
  copyGuidedStepFields,
  dedupeAlternativeOptions,
  enforceGuidedPlanUniqueness,
  getCurrentGuidedStep,
  getRenderableGuidedPlan,
  parseAverageReps,
  reconfigureGuidedPlanAfterPermanentHide,
  renderTodayPlanView
} from "./guided-session.js";
import { buildLoggableExerciseContexts, normalizeLookupText, resolveLogContextFromInput } from "./logging-catalog.js";
import {
  buildMachineActionSummary,
  buildMachineCardFragment,
  labelForEquipmentType,
  renderMachineSheetErrorView,
  renderMachineSheetView,
  supportsAvailabilityToggle
} from "./machine-ui.js";
import {
  buildFocusAvatarMarkup,
  getSelectedMuscleIds,
  hasSpecificMuscleSelection,
  isMuscleFilterActive,
  labelForMuscle,
  matchesSelectedMuscles,
  musclesForVisualFocus,
  pickPrimaryMuscle,
  selectedMuscleFilterCopy,
  selectedMuscleFilterLabel,
  toggleSelectedMuscleSelection
} from "./muscle-ui.js";
import { buildProgressionProfile } from "./proportionality.js";
import { buildCalendarDays, buildRoutine, compareProducts, createUsageStats, decorateRecommendations, filterProducts, getHiddenProducts, getVisibleProducts } from "./recommendations.js";
import { runClientMigrations } from "./migrations.js";
import { deleteSessionCascade, readCustomExercises, readMachinePrefs, readMeta, readProducts, readRoutineDays, readSessions, readUsageEvents, replaceSessionUsageEvents, writeCustomExercise, writeMachinePref, writeMeta, writeProducts, writeRoutineDay, writeSession, writeUsageEvent, writeUsageEventAndSession } from "./storage.js";

const state = {
  products: [],
  decoratedProducts: [],
  filteredProducts: [],
  decoratedBodyweight: [],
  selectedMuscle: ["all"],
  selectedEquipmentType: "all",
  selectedSort: "recommended",
  selectedDuration: 20,
  selectedObjective: "hypertrophy",
  selectedBrand: "all",
  searchQuery: "",
  syncInProgress: false,
  imageCacheInProgress: false,
  machinePrefs: {},
  usageEvents: [],
  customExercises: [],
  routineDays: [],
  sessions: [],
  activeSessionId: null,
  usageStats: { total: 0, byProductId: {}, lastUsedDays: {}, byDate: {}, byMuscleRecent: {} },
  sessionTimerId: null,
  sessionStartedAt: null,
  sessionElapsedMs: 0,
  restTimerId: null,
  restEndsAt: null,
  wakeLock: null,
  pendingLogContext: null,
  serviceWorkerReady: false,
  firstUseDismissed: false,
  machineSheetCache: {},
  machineSheetRequestToken: 0,
  editingCompletedSessionId: null,
  editingCompletedSessionDraft: null,
  bodyMapMarkup: "",
  plannerMobileMode: "form",
  todayPlanStage: "current"
};

const SECTION_CONTEXT = {
  "section-discover": { progress: 16, text: "Panell curt: avui, registre i sessio en marxa." },
  "section-recommendations": { progress: 44, text: "Si hi ha proposta, entra; si no, salta a un fallback practic." },
  "section-weekly": { progress: 66, text: "Veu que falta i corregeix la setmana amb una sortida clara." },
  "section-planner": { progress: 58, text: "Afegeix nomes el minim i deixa el dia preparat." },
  "section-bodyweight": { progress: 36, text: "Entrena avui sense dependre del cataleg del gimnas." },
  "section-catalog": { progress: 24, text: "Marca parc real i neteja futures recomanacions." },
  "section-hidden": { progress: 28, text: "Recupera maquines amagades si el gimnas canvia." },
  "section-timers": { progress: 60, text: "Temps i descans sense sortir del flux d'entrenament." },
  "section-log": { progress: 74, text: "Registre express amb el minim de decisions possibles." },
  "section-session": { progress: 80, text: "Continua, tanca o reaprofita la sessio viva." },
  "section-history": { progress: 88, text: "Progres recent, calendari i equilibri corporal." }
};

const GYM_AREA_OPTIONS = [
  { value: "", label: "Selecciona zona o equip" },
  { value: "Maquina guiada", label: "Maquina guiada" },
  { value: "Maquina de discs", label: "Maquina de discs" },
  { value: "Cable / politja", label: "Cable / politja" },
  { value: "Pes corporal", label: "Pes corporal" },
  { value: "Mancuernes", label: "Mancuernes" },
  { value: "Barra", label: "Barra" },
  { value: "Banc", label: "Banc" },
  { value: "Banda elastica", label: "Banda elastica" },
  { value: "Core / estoreta", label: "Core / estoreta" },
  { value: "Cardio", label: "Cardio" },
  { value: "Altre", label: "Altre" }
];

const SET_SELECT_OPTIONS = [
  { value: "", label: "Tria series" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" }
];

const REP_SELECT_OPTIONS = [
  { value: "", label: "Tria reps o temps" },
  { value: "5-8", label: "5-8 rep" },
  { value: "6-10", label: "6-10 rep" },
  { value: "8-12", label: "8-12 rep" },
  { value: "10-12", label: "10-12 rep" },
  { value: "10-15", label: "10-15 rep" },
  { value: "12-15", label: "12-15 rep" },
  { value: "12-20", label: "12-20 rep" },
  { value: "15-20", label: "15-20 rep" },
  { value: "20-30s", label: "20-30 s" },
  { value: "30-45s", label: "30-45 s" },
  { value: "45-60s", label: "45-60 s" }
];

const NOTE_SELECT_OPTIONS = [
  { value: "", label: "Sense nota" },
  { value: "Tecnica controlada", label: "Tecnica controlada" },
  { value: "Ultima serie dura", label: "Ultima serie dura" },
  { value: "RIR 2 aprox.", label: "RIR 2 aprox." },
  { value: "Descans curt", label: "Descans curt" },
  { value: "Descans llarg", label: "Descans llarg" },
  { value: "Sense dolor", label: "Sense dolor" },
  { value: "Core ferm", label: "Core ferm" },
  { value: "Puja pes la proxima", label: "Puja pes la proxima" },
  { value: "Baixa pes i prioritza rang", label: "Baixa pes i prioritza rang" }
];

const WEIGHT_SELECT_OPTIONS = buildWeightSelectOptions();

const EXERCISE_TEMPLATE_OPTIONS = [
  {
    id: "machine-chest-press",
    name: "Chest press guiat",
    gymArea: "Maquina guiada",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-pec-deck",
    name: "Pec deck",
    gymArea: "Maquina guiada",
    primaryMuscle: "chest",
    secondaryMuscles: ["shoulders"],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-push-up",
    name: "Flexions",
    gymArea: "Pes corporal",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    sets: "3",
    reps: "8-12",
    notes: "Core ferm"
  },
  {
    id: "machine-lat-pulldown",
    name: "Lat pulldown",
    gymArea: "Cable / politja",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-seated-row",
    name: "Rem assegut",
    gymArea: "Maquina guiada",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-band-row",
    name: "Rem amb banda",
    gymArea: "Banda elastica",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
    sets: "3",
    reps: "10-15",
    notes: "Core ferm"
  },
  {
    id: "machine-shoulder-press",
    name: "Shoulder press",
    gymArea: "Maquina guiada",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["triceps"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-lateral-raise",
    name: "Elevacions laterals",
    gymArea: "Mancuernes",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["core"],
    sets: "3",
    reps: "12-15",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-biceps-curl",
    name: "Curl de biceps",
    gymArea: "Mancuernes",
    primaryMuscle: "biceps",
    secondaryMuscles: [],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-band-curl",
    name: "Curl amb banda",
    gymArea: "Banda elastica",
    primaryMuscle: "biceps",
    secondaryMuscles: [],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-triceps-pushdown",
    name: "Pushdown a politja",
    gymArea: "Cable / politja",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-chair-dips",
    name: "Dips en cadira",
    gymArea: "Pes corporal",
    primaryMuscle: "triceps",
    secondaryMuscles: ["shoulders", "chest"],
    sets: "3",
    reps: "6-10",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-leg-press",
    name: "Leg press",
    gymArea: "Maquina guiada",
    primaryMuscle: "legs",
    secondaryMuscles: ["glutes"],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-air-squat",
    name: "Air squat",
    gymArea: "Pes corporal",
    primaryMuscle: "legs",
    secondaryMuscles: ["glutes", "core"],
    sets: "3",
    reps: "12-20",
    notes: "Core ferm"
  },
  {
    id: "bodyweight-step-up",
    name: "Step-up",
    gymArea: "Banc",
    primaryMuscle: "legs",
    secondaryMuscles: ["glutes", "core"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "machine-leg-curl",
    name: "Curl femoral",
    gymArea: "Maquina guiada",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes"],
    sets: "3",
    reps: "10-15",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-hamstring-walkout",
    name: "Hamstring walkout",
    gymArea: "Core / estoreta",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes", "core"],
    sets: "3",
    reps: "6-10",
    notes: "Core ferm"
  },
  {
    id: "machine-hip-thrust",
    name: "Hip thrust",
    gymArea: "Barra",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core"],
    sets: "3",
    reps: "8-12",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-glute-bridge",
    name: "Glute bridge",
    gymArea: "Core / estoreta",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core"],
    sets: "3",
    reps: "12-20",
    notes: "Core ferm"
  },
  {
    id: "machine-calf-raise",
    name: "Elevacio de bessons",
    gymArea: "Maquina guiada",
    primaryMuscle: "calves",
    secondaryMuscles: ["legs"],
    sets: "3",
    reps: "12-20",
    notes: "Tecnica controlada"
  },
  {
    id: "bodyweight-plank",
    name: "Planxa",
    gymArea: "Core / estoreta",
    primaryMuscle: "core",
    secondaryMuscles: ["shoulders"],
    sets: "3",
    reps: "30-45s",
    notes: "Core ferm"
  },
  {
    id: "bodyweight-side-plank",
    name: "Side plank",
    gymArea: "Core / estoreta",
    primaryMuscle: "core",
    secondaryMuscles: ["shoulders"],
    sets: "3",
    reps: "20-30s",
    notes: "Core ferm"
  },
  {
    id: "cardio-treadmill",
    name: "Cinta amb pendent",
    gymArea: "Cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: ["legs", "glutes"],
    sets: "1",
    reps: "8-20 min",
    notes: "Descans curt"
  },
  {
    id: "cardio-stairs",
    name: "Pujar escales",
    gymArea: "Cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: ["legs", "glutes", "calves"],
    sets: "1",
    reps: "8-20 min",
    notes: "Descans curt"
  }
];

const elements = {
  syncButton: document.querySelector("#sync-button"),
  cacheImagesButton: document.querySelector("#cache-images-button"),
  catalogStatus: document.querySelector("#catalog-status"),
  offlineStatus: document.querySelector("#offline-status"),
  progressText: document.querySelector("#progress-text"),
  progressFill: document.querySelector("#progress-fill"),
  summaryText: document.querySelector("#summary-text"),
  todayPlanPanel: document.querySelector("#today-plan-panel"),
  todayPlanSummary: document.querySelector("#today-plan-summary"),
  todayPlanCurrent: document.querySelector("#today-plan-current"),
  todayPlanEmptyActions: document.querySelector("#today-plan-empty-actions"),
  todayPlanEmptyBodyweight: document.querySelector("#today-plan-empty-bodyweight"),
  todayPlanEmptyCatalog: document.querySelector("#today-plan-empty-catalog"),
  todayPlanStageTabs: document.querySelector("#today-plan-stage-tabs"),
  todayPlanStageCurrent: document.querySelector("#today-plan-stage-current"),
  todayPlanStageSwitch: document.querySelector("#today-plan-stage-switch"),
  todayPlanStageCurrentPanel: document.querySelector("#today-plan-stage-current-panel"),
  todayPlanStageSwitchPanel: document.querySelector("#today-plan-stage-switch-panel"),
  todayPlanAlternatives: document.querySelector("#today-plan-alternatives"),
  todayPlanStart: document.querySelector("#today-plan-start"),
  todayPlanLog: document.querySelector("#today-plan-log"),
  todayPlanOccupied: document.querySelector("#today-plan-occupied"),
  todayPlanHide: document.querySelector("#today-plan-hide"),
  todayPlanSkip: document.querySelector("#today-plan-skip"),
  todayPlanRefresh: document.querySelector("#today-plan-refresh"),
  recommendations: document.querySelector("#recommendations"),
  catalogGrid: document.querySelector("#catalog-grid"),
  catalogCount: document.querySelector("#catalog-count"),
  emptyState: document.querySelector("#empty-state"),
  catalogEmptyActions: document.querySelector("#catalog-empty-actions"),
  catalogSyncAction: document.querySelector("#catalog-sync-action"),
  searchInput: document.querySelector("#search-input"),
  firstUseWizard: document.querySelector("#first-use-wizard"),
  firstUseCopy: document.querySelector("#first-use-copy"),
  muscleFilters: document.querySelector("#muscle-filters"),
  equipmentFilter: document.querySelector("#equipment-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  cardTemplate: document.querySelector("#card-template"),
  hiddenGrid: document.querySelector("#hidden-grid"),
  hiddenCount: document.querySelector("#hidden-count"),
  hiddenEmptyState: document.querySelector("#hidden-empty-state"),
  hiddenEmptyActions: document.querySelector("#hidden-empty-actions"),
  bodyweightSummary: document.querySelector("#bodyweight-summary"),
  bodyweightGrid: document.querySelector("#bodyweight-grid"),
  weeklyStatus: document.querySelector("#weekly-status"),
  weeklyAlert: document.querySelector("#weekly-alert"),
  weeklyMuscleGrid: document.querySelector("#weekly-muscle-grid"),
  weeklyInsights: document.querySelector("#weekly-insights"),
  plannerStatus: document.querySelector("#planner-status"),
  plannerModeActions: document.querySelector("#planner-mode-actions"),
  plannerModeForm: document.querySelector("#planner-mode-form"),
  plannerModeList: document.querySelector("#planner-mode-list"),
  plannerListCard: document.querySelector("#planner-list-card"),
  plannerFormCard: document.querySelector("#planner-form-card"),
  routineDayGrid: document.querySelector("#routine-day-grid"),
  exerciseForm: document.querySelector("#exercise-form"),
  exerciseDay: document.querySelector("#exercise-day"),
  exerciseTemplate: document.querySelector("#exercise-template"),
  exerciseDetails: document.querySelector("#exercise-details"),
  exerciseCustomNameField: document.querySelector("#exercise-custom-name-field"),
  exerciseCustomName: document.querySelector("#exercise-custom-name"),
  exerciseGymArea: document.querySelector("#exercise-gym-area"),
  exercisePrimaryMuscle: document.querySelector("#exercise-primary-muscle"),
  exerciseSecondaryMuscles: document.querySelector("#exercise-secondary-muscles"),
  exerciseSets: document.querySelector("#exercise-sets"),
  exerciseReps: document.querySelector("#exercise-reps"),
  exerciseWeight: document.querySelector("#exercise-weight"),
  exerciseNotes: document.querySelector("#exercise-notes"),
  exerciseSubmit: document.querySelector("#exercise-form button[type='submit']"),
  discoverFocusMap: document.querySelector("#discover-focus-map"),
  discoverFocusLabel: document.querySelector("#discover-focus-label"),
  discoverFocusCopy: document.querySelector("#discover-focus-copy"),
  plannerFocusMap: document.querySelector("#planner-focus-map"),
  plannerFocusLabel: document.querySelector("#planner-focus-label"),
  plannerFocusCopy: document.querySelector("#planner-focus-copy"),
  weeklyFocusMap: document.querySelector("#weekly-focus-map"),
  weeklyFocusLabel: document.querySelector("#weekly-focus-label"),
  weeklyFocusCopy: document.querySelector("#weekly-focus-copy"),
  sessionStatus: document.querySelector("#session-status"),
  activeSessionStart: document.querySelector("#active-session-start"),
  activeSessionEnd: document.querySelector("#active-session-end"),
  copyLastSession: document.querySelector("#copy-last-session"),
  activeSessionSummary: document.querySelector("#active-session-summary"),
  activeSessionList: document.querySelector("#active-session-list"),
  completedSessionList: document.querySelector("#completed-session-list"),
  completedSessionEditor: document.querySelector("#completed-session-editor"),
  completedSessionEditorSummary: document.querySelector("#completed-session-editor-summary"),
  completedSessionForm: document.querySelector("#completed-session-form"),
  completedSessionObjective: document.querySelector("#completed-session-objective"),
  completedSessionEntryList: document.querySelector("#completed-session-entry-list"),
  completedSessionSave: document.querySelector("#completed-session-save"),
  completedSessionCancel: document.querySelector("#completed-session-cancel"),
  completedSessionDelete: document.querySelector("#completed-session-delete"),
  prList: document.querySelector("#pr-list"),
  historySummary: document.querySelector("#history-summary"),
  historyCalendarCard: document.querySelector("#history-calendar-card"),
  historyCalendar: document.querySelector("#history-calendar"),
  calendarTitle: document.querySelector("#calendar-title"),
  historyList: document.querySelector("#history-list"),
  balanceSummary: document.querySelector("#balance-summary"),
  balanceLegend: document.querySelector("#balance-legend"),
  bodyMapHost: document.querySelector("#body-map-host"),
  notificationStatus: document.querySelector("#notification-status"),
  sessionClock: document.querySelector("#session-clock"),
  sessionStart: document.querySelector("#session-start"),
  sessionPause: document.querySelector("#session-pause"),
  sessionReset: document.querySelector("#session-reset"),
  restClock: document.querySelector("#rest-clock"),
  restPresets: document.querySelector("#rest-presets"),
  restStop: document.querySelector("#rest-stop"),
  notificationPermission: document.querySelector("#notification-permission"),
  wakeLockToggle: document.querySelector("#wake-lock-toggle"),
  logFormStatus: document.querySelector("#log-form-status"),
  logQuickPicks: document.querySelector("#log-quick-picks"),
  logForm: document.querySelector("#log-form"),
  logFormExercise: document.querySelector("#log-form-exercise"),
  logFormSets: document.querySelector("#log-form-sets"),
  logFormReps: document.querySelector("#log-form-reps"),
  logFormWeight: document.querySelector("#log-form-weight"),
  logFormNotes: document.querySelector("#log-form-notes"),
  logFocusMap: document.querySelector("#log-focus-map"),
  logFocusLabel: document.querySelector("#log-focus-label"),
  logFocusCopy: document.querySelector("#log-focus-copy"),
  logFormSubmit: document.querySelector("#log-form-submit"),
  logFormCancel: document.querySelector("#log-form-cancel"),
  logNextActions: document.querySelector("#log-next-actions"),
  machineSheetModal: document.querySelector("#machine-sheet-modal"),
  machineSheetTitle: document.querySelector("#machine-sheet-title"),
  machineSheetSubtitle: document.querySelector("#machine-sheet-subtitle"),
  machineSheetStatus: document.querySelector("#machine-sheet-status"),
  machineSheetBody: document.querySelector("#machine-sheet-body"),
  machineSheetSource: document.querySelector("#machine-sheet-source")
};

export async function boot() {
  document.title = APP_NAME;
  await runClientMigrations();
  renderToolbarSelectors();
  renderMuscleFilters();
  bindEvents();
  initTimers();
  await loadBodyMap();
  registerServiceWorker();
  updateOfflineIndicator();
  paintNotificationSupport();

  populatePlannerSelects();
  togglePlannerDetails(false);
  updatePlannerSubmitState();
  clearLogForm();
  syncPlannerModeUI();

  const [products, meta, prefs, usageEvents, sessions, customExercises, routineDays, firstUseMeta] = await Promise.all([
    readProducts(),
    readMeta("sync"),
    readMachinePrefs(),
    readUsageEvents(),
    readSessions(),
    readCustomExercises(),
    readRoutineDays(),
    readMeta("first-use")
  ]);

  state.products = products;
  state.machinePrefs = Object.fromEntries(prefs.map((entry) => [entry.id, entry]));
  state.usageEvents = usageEvents.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  state.customExercises = customExercises.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  state.routineDays = sortRoutineDays(routineDays);
  state.sessions = sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  state.activeSessionId = state.sessions.find((session) => !session.endedAt)?.id || null;
  state.firstUseDismissed = Boolean(firstUseMeta?.dismissedAt);
  rehydrateActiveSessionTimer();
  recomputeDerivedState();
  renderAll();
  paintSyncMeta(meta);

  if (products.length > 0) {
    setProgress(100, "Cataleg recuperat del dispositiu.");
  } else {
    setProgress(0, "Pots entrenar ara mateix.");
  }

  paintSectionContext(window.location.hash.replace(/^#/, "") || "section-discover");
}

function bindEvents() {
  elements.syncButton.addEventListener("click", () => syncCatalog());
  elements.cacheImagesButton.addEventListener("click", () => cacheAllImages(getVisibleProducts(state.products, state.machinePrefs)));
  elements.catalogSyncAction?.addEventListener("click", () => syncCatalog());
  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value.trim().toLowerCase();
    recomputeDerivedState();
    renderAll();
  });
  elements.equipmentFilter.addEventListener("change", (event) => {
    state.selectedEquipmentType = event.target.value;
    recomputeDerivedState();
    renderAll();
  });
  elements.sortFilter.addEventListener("change", (event) => {
    state.selectedSort = event.target.value;
    recomputeDerivedState();
    renderAll();
  });
  elements.activeSessionStart.addEventListener("click", startActiveWorkoutSession);
  elements.activeSessionEnd.addEventListener("click", finishActiveWorkoutSession);
  elements.copyLastSession.addEventListener("click", copyLatestSession);
  elements.exerciseForm.addEventListener("submit", handleExerciseFormSubmit);
  elements.exerciseForm.addEventListener("change", handleExerciseFormChange);
  elements.exerciseCustomName?.addEventListener("input", updatePlannerSubmitState);
  elements.plannerModeActions?.addEventListener("click", handlePlannerModeClick);
  elements.completedSessionForm?.addEventListener("submit", handleCompletedSessionFormSubmit);
  elements.completedSessionForm?.addEventListener("input", handleCompletedSessionFormInput);
  elements.completedSessionForm?.addEventListener("change", handleCompletedSessionFormInput);
  elements.completedSessionForm?.addEventListener("click", handleCompletedSessionFormClick);
  elements.completedSessionCancel?.addEventListener("click", closeCompletedSessionEditor);
  elements.completedSessionDelete?.addEventListener("click", handleCompletedSessionDelete);
  elements.sessionStart.addEventListener("click", startSessionTimer);
  elements.sessionPause.addEventListener("click", pauseSessionTimer);
  elements.sessionReset.addEventListener("click", resetSessionTimer);
  elements.restStop.addEventListener("click", stopRestTimer);
  elements.restPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rest-seconds]");
    if (!button) {
      return;
    }
    startRestTimer(Number(button.dataset.restSeconds));
  });
  elements.notificationPermission.addEventListener("click", requestNotificationPermission);
  elements.wakeLockToggle.addEventListener("click", toggleWakeLock);
  elements.todayPlanStart?.addEventListener("click", handleTodayPlanStart);
  elements.todayPlanLog?.addEventListener("click", handleTodayPlanLog);
  elements.todayPlanStageTabs?.addEventListener("click", handleTodayPlanStageClick);
  elements.todayPlanOccupied?.addEventListener("click", handleTodayPlanOccupied);
  elements.todayPlanHide?.addEventListener("click", handleTodayPlanHide);
  elements.todayPlanAlternatives?.addEventListener("click", handleTodayPlanAlternativeRailClick);
  elements.recommendations?.addEventListener("click", handleGuidedCardAlternativeRailClick);
  elements.todayPlanSkip?.addEventListener("click", handleTodayPlanSkip);
  elements.todayPlanRefresh?.addEventListener("click", handleTodayPlanRefresh);
  elements.todayPlanEmptyBodyweight?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-bodyweight" } }));
  });
  elements.todayPlanEmptyCatalog?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-catalog" } }));
  });
  elements.logForm.addEventListener("submit", handleLogFormSubmit);
  elements.logFormCancel.addEventListener("click", () => clearLogForm());
  elements.logFormExercise.addEventListener("change", handleLogExerciseInput);
  elements.logQuickPicks?.addEventListener("click", handleLogQuickPickClick);
  elements.logNextActions.addEventListener("click", handleLogNextActionsClick);
  elements.firstUseWizard?.addEventListener("click", handleFirstUseAction);
  elements.machineSheetModal?.addEventListener("click", handleMachineSheetClick);
  document.addEventListener("click", handleScrollTargetClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("gymbros:section-changed", handleSectionChanged);
  window.addEventListener("online", updateOfflineIndicator);
  window.addEventListener("offline", updateOfflineIndicator);
  window.addEventListener("resize", () => syncPlannerModeUI());
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function renderToolbarSelectors() {
  const toolbar = document.querySelector(".toolbar");
  const durationField = document.createElement("label");
  durationField.className = "toolbar__field";
  durationField.innerHTML = `
    <span>Temps</span>
    <select id="duration-filter">
      ${DURATION_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
    </select>
  `;
  toolbar.prepend(durationField);
  const durationSelect = durationField.querySelector("select");
  durationSelect.value = String(state.selectedDuration);
  durationSelect.addEventListener("change", (event) => {
    state.selectedDuration = Number(event.target.value);
    recomputeDerivedState();
    renderAll();
  });

  const objectiveField = document.createElement("label");
  objectiveField.className = "toolbar__field";
  objectiveField.innerHTML = `
    <span>Objectiu</span>
    <select id="objective-filter">
      ${OBJECTIVE_OPTIONS.map((option) => `<option value="${option.id}">${option.label}</option>`).join("")}
    </select>
  `;
  toolbar.prepend(objectiveField);
  const objectiveSelect = objectiveField.querySelector("select");
  objectiveSelect.value = state.selectedObjective;
  objectiveSelect.addEventListener("change", (event) => {
    state.selectedObjective = event.target.value;
    recomputeDerivedState();
    renderAll();
  });

  const brandField = document.createElement("label");
  brandField.className = "toolbar__field";
  brandField.innerHTML = `
    <span>Marca</span>
    <select id="brand-filter">
      <option value="all">Totes</option>
      ${CATALOG_PROVIDERS.map((provider) => `<option value="${provider.id}">${provider.label}</option>`).join("")}
    </select>
  `;
  toolbar.prepend(brandField);
  const brandSelect = brandField.querySelector("select");
  brandSelect.value = state.selectedBrand;
  brandSelect.addEventListener("change", (event) => {
    state.selectedBrand = event.target.value;
    recomputeDerivedState();
    renderAll();
  });
}

function renderMuscleFilters() {
  elements.muscleFilters.innerHTML = "";
  for (const muscle of MUSCLE_GROUPS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip chip--muscle${isMuscleFilterActive(state.selectedMuscle, muscle.id) ? " is-active" : ""}`;
    button.setAttribute("aria-pressed", String(isMuscleFilterActive(state.selectedMuscle, muscle.id)));
    button.innerHTML = `
      <span class="chip__visual" aria-hidden="true">${buildMuscleFilterVisual(muscle.id)}</span>
      <span class="chip__label">${escapeHtml(muscle.label)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedMuscle = toggleSelectedMuscleSelection(state.selectedMuscle, muscle.id);
      renderMuscleFilters();
      recomputeDerivedState();
      renderAll();
    });
    elements.muscleFilters.append(button);
  }
}

function buildMuscleFilterVisual(muscleId) {
  const muscles = muscleId === "all" ? CHECKLIST_MUSCLE_GROUPS : [muscleId];
  return buildFocusAvatarMarkup(muscles, muscleId, isMuscleFilterActive(state.selectedMuscle, muscleId) ? "accent" : "neutral");
}

function setTodayPlanStage(stage) {
  state.todayPlanStage = stage === "switch" ? "switch" : "current";
}

function populatePlannerSelects() {
  elements.exerciseDay.innerHTML = ROUTINE_DAY_OPTIONS
    .map((option) => `<option value="${option.id}">${option.label}</option>`)
    .join("");

  renderSelectOptions(elements.exerciseTemplate, [
    { value: "", label: "Selecciona una plantilla guiada" },
    ...EXERCISE_TEMPLATE_OPTIONS.map((template) => ({
      value: template.id,
      label: `${labelForMuscle(template.primaryMuscle)} - ${template.name}`
    })),
    { value: "__custom__", label: "Altre / personalitzat" }
  ]);

  const muscleOptions = CHECKLIST_MUSCLE_GROUPS
    .map((muscleId) => `<option value="${muscleId}">${labelForMuscle(muscleId)}</option>`)
    .join("");

  elements.exercisePrimaryMuscle.innerHTML = muscleOptions;
  elements.exerciseSecondaryMuscles.innerHTML = muscleOptions;
  renderSelectOptions(elements.exerciseGymArea, GYM_AREA_OPTIONS);
  renderSelectOptions(elements.exerciseSets, SET_SELECT_OPTIONS);
  renderSelectOptions(elements.exerciseReps, REP_SELECT_OPTIONS);
  renderSelectOptions(elements.exerciseWeight, WEIGHT_SELECT_OPTIONS);
  renderSelectOptions(elements.exerciseNotes, NOTE_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormSets, SET_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormReps, REP_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormWeight, WEIGHT_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormNotes, NOTE_SELECT_OPTIONS);
  renderSelectOptions(elements.completedSessionObjective, OBJECTIVE_OPTIONS.map((option) => ({ value: option.id, label: option.label })));
}

function renderSelectOptions(select, options) {
  if (!select) {
    return;
  }
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function setSelectValue(select, value, fallbackLabel = value) {
  if (!select) {
    return;
  }

  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    select.value = "";
    return;
  }

  const existing = Array.from(select.options).find((option) => option.value === normalizedValue);
  if (!existing) {
    const option = document.createElement("option");
    option.value = normalizedValue;
    option.textContent = String(fallbackLabel || normalizedValue);
    select.append(option);
  }
  select.value = normalizedValue;
}

function setMultiSelectValues(select, values) {
  if (!select) {
    return;
  }
  const selected = new Set((values || []).map((value) => String(value)));
  Array.from(select.options).forEach((option) => {
    option.selected = selected.has(option.value);
  });
}

function buildSelectMarkup(options, selectedValue, fallbackLabel = selectedValue) {
  const normalizedValue = String(selectedValue ?? "").trim();
  const list = [...options];
  if (normalizedValue && !list.some((option) => String(option.value) === normalizedValue)) {
    list.push({ value: normalizedValue, label: String(fallbackLabel || normalizedValue) });
  }
  return list
    .map((option) => {
      const optionValue = String(option.value ?? "");
      const selected = optionValue === normalizedValue ? " selected" : "";
      return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(String(option.label ?? optionValue))}</option>`;
    })
    .join("");
}

function findExerciseTemplate(templateId) {
  return EXERCISE_TEMPLATE_OPTIONS.find((template) => template.id === templateId) || null;
}

function applyExerciseTemplateToForm(template) {
  if (!template) {
    return;
  }

  setSelectValue(elements.exerciseGymArea, template.gymArea || "");
  setSelectValue(elements.exercisePrimaryMuscle, template.primaryMuscle || "");
  setMultiSelectValues(elements.exerciseSecondaryMuscles, template.secondaryMuscles || []);
  setSelectValue(elements.exerciseSets, template.sets || "");
  setSelectValue(elements.exerciseReps, template.reps || "");
  setSelectValue(elements.exerciseWeight, template.weightKg ?? "");
  setSelectValue(elements.exerciseNotes, template.notes || "");
}

function togglePlannerCustomNameField(show) {
  if (!elements.exerciseCustomNameField || !elements.exerciseCustomName) {
    return;
  }
  elements.exerciseCustomNameField.hidden = !show;
  elements.exerciseCustomName.required = show;
  if (!show) {
    elements.exerciseCustomName.value = "";
  }
}

function togglePlannerDetails(show) {
  if (!elements.exerciseDetails) {
    return;
  }
  elements.exerciseDetails.hidden = !show;
}

function updatePlannerSubmitState() {
  if (!elements.exerciseSubmit) {
    return;
  }
  const templateId = String(elements.exerciseTemplate?.value || "").trim();
  const hasTemplate = Boolean(templateId);
  const needsCustomName = templateId === "__custom__";
  const hasCustomName = Boolean(String(elements.exerciseCustomName?.value || "").trim());
  const blocked = !hasTemplate || (needsCustomName && !hasCustomName);
  elements.exerciseSubmit.disabled = blocked;
  if (blocked) {
    elements.exerciseSubmit.textContent = hasTemplate ? "Escriu nom" : "Tria plantilla";
    elements.exerciseSubmit.title = hasTemplate ? "Cal posar un nom per a l'exercici personalitzat." : "Cal triar una plantilla abans de guardar.";
    return;
  }
  elements.exerciseSubmit.textContent = "Guardar al pla";
  elements.exerciseSubmit.title = "Guardar al pla";
}

function handleExerciseFormChange(event) {
  if (event.target !== elements.exerciseTemplate) {
    if (event.target === elements.exercisePrimaryMuscle || event.target === elements.exerciseSecondaryMuscles) {
      renderFocusMaps();
    }
    if (event.target === elements.exerciseCustomName) {
      updatePlannerSubmitState();
    }
    return;
  }

  const templateId = String(elements.exerciseTemplate.value || "").trim();
  if (templateId === "__custom__") {
    togglePlannerCustomNameField(true);
    togglePlannerDetails(true);
    setMultiSelectValues(elements.exerciseSecondaryMuscles, []);
    setSelectValue(elements.exerciseNotes, "");
    setSelectValue(elements.exerciseWeight, "");
    setSelectValue(elements.exerciseSets, "");
    setSelectValue(elements.exerciseReps, "");
    setSelectValue(elements.exerciseGymArea, "");
    elements.exerciseCustomName.focus();
    updatePlannerSubmitState();
    renderFocusMaps();
    return;
  }

  togglePlannerCustomNameField(false);
  const template = findExerciseTemplate(templateId);
  if (!template) {
    togglePlannerDetails(false);
    setSelectValue(elements.exerciseGymArea, "");
    setSelectValue(elements.exercisePrimaryMuscle, CHECKLIST_MUSCLE_GROUPS[0] || "");
    setMultiSelectValues(elements.exerciseSecondaryMuscles, []);
    setSelectValue(elements.exerciseSets, "");
    setSelectValue(elements.exerciseReps, "");
    setSelectValue(elements.exerciseWeight, "");
    setSelectValue(elements.exerciseNotes, "");
    updatePlannerSubmitState();
    renderFocusMaps();
    return;
  }

  togglePlannerDetails(true);
  applyExerciseTemplateToForm(template);
  updatePlannerSubmitState();
  renderFocusMaps();
}

function renderLogQuickPicks() {
  if (!elements.logQuickPicks) {
    return;
  }

  const recent = [];
  const seen = new Set();

  state.usageEvents.forEach((event) => {
    const key = normalizeLookupText(event.productTitle);
    if (!key || seen.has(key)) {
      return;
    }
    const context = resolveLogContextFromInput(getLoggableExerciseContexts(), event.productTitle);
    if (!context) {
      return;
    }
    seen.add(key);
    recent.push(context);
  });

  if (recent.length === 0) {
    const starterNames = ["Planxa", "Air squat", "Flexions", "Rem amb banda"];
    starterNames.forEach((name) => {
      const context = resolveLogContextFromInput(getLoggableExerciseContexts(), name);
      if (context && !seen.has(normalizeLookupText(context.title))) {
        seen.add(normalizeLookupText(context.title));
        recent.push(context);
      }
    });
  }

  elements.logQuickPicks.innerHTML = recent.slice(0, 5)
    .map((context) => `<button class="chip chip--quick" type="button" data-log-quick-pick="${escapeHtml(context.title)}">${escapeHtml(context.title)}</button>`)
    .join("");
}

function handleLogQuickPickClick(event) {
  const button = event.target.closest("[data-log-quick-pick]");
  if (!button) {
    return;
  }
  const context = resolveLogContextFromInput(getLoggableExerciseContexts(), button.dataset.logQuickPick);
  if (!context) {
    return;
  }
  openLogForm(context);
}

function renderFirstUseWizard() {
  if (!elements.firstUseWizard || !elements.firstUseCopy) {
    return;
  }

  const hasHistory = state.usageEvents.length > 0;
  const shouldShow = !state.firstUseDismissed && !hasHistory;
  elements.firstUseWizard.hidden = !shouldShow;

  if (!shouldShow) {
    return;
  }

  const hasCatalog = state.products.length > 0;
  elements.firstUseCopy.textContent = hasCatalog
    ? "Cataleg local llest. Tria ruta."
    : "Entrena ara o afegeix cataleg.";
}

async function handleFirstUseAction(event) {
  const button = event.target.closest("[data-first-use-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.firstUseAction;
  if (action === "dismiss") {
    await dismissFirstUseWizard("manual-dismiss");
    renderAll();
    return;
  }

  if (action === "bodyweight") {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-bodyweight" } }));
    return;
  }

  if (action === "recommendations") {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-recommendations" } }));
    return;
  }

  if (action === "gym") {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-catalog" } }));
  }
}

function handleSectionChanged(event) {
  const sectionId = event.detail?.sectionId;
  paintSectionContext(sectionId);
  if (sectionId === "section-log" && !state.pendingLogContext && !elements.logNextActions.hidden) {
    clearLogForm();
  }
}

function handlePlannerModeClick(event) {
  const button = event.target.closest("[data-planner-mode]");
  if (!button) {
    return;
  }
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  if (!isMobile) {
    const target = button.dataset.plannerMode === "list" ? elements.plannerListCard : elements.plannerFormCard;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  state.plannerMobileMode = button.dataset.plannerMode === "list" ? "list" : "form";
  syncPlannerModeUI(true);
}

function handleScrollTargetClick(event) {
  const button = event.target.closest("[data-scroll-target]");
  if (!button) {
    return;
  }
  const target = document.getElementById(button.dataset.scrollTarget);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncPlannerModeUI(shouldScroll = false) {
  if (!elements.plannerFormCard || !elements.plannerListCard || !elements.plannerModeForm || !elements.plannerModeList) {
    return;
  }

  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const showList = isMobile && state.plannerMobileMode === "list";
  elements.plannerFormCard.hidden = isMobile && showList;
  elements.plannerListCard.hidden = isMobile && !showList;

  const formActive = !showList;
  elements.plannerModeForm.classList.toggle("button--primary", formActive);
  elements.plannerModeForm.classList.toggle("button--ghost", !formActive);
  elements.plannerModeForm.setAttribute("aria-pressed", String(formActive));
  elements.plannerModeList.classList.toggle("button--primary", showList);
  elements.plannerModeList.classList.toggle("button--ghost", !showList);
  elements.plannerModeList.setAttribute("aria-pressed", String(showList));

  if (shouldScroll) {
    const target = showList ? elements.plannerListCard : elements.plannerFormCard;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function dismissFirstUseWizard(reason) {
  state.firstUseDismissed = true;
  await writeMeta({
    key: "first-use",
    dismissedAt: new Date().toISOString(),
    reason
  });
}

async function syncCatalog() {
  if (state.syncInProgress) {
    return;
  }

  state.syncInProgress = true;
  setBusyState();
  setProgress(0, "Sincronitzant cataleg public d'F&H...");

  try {
    const products = await fetchCatalogWithProgress((completed, total, label) => {
      setProgress(Math.round((completed / total) * 100), `Sincronitzant ${label} (${completed}/${total})`);
    });

    await writeProducts(products);
    const meta = {
      key: "sync",
      lastSyncedAt: new Date().toISOString(),
      productCount: products.length,
      syncVersion: SYNC_VERSION,
      source: "F&H Shopify public API"
    };
    await writeMeta(meta);

    state.products = products;
    recomputeDerivedState();
    renderAll();
    paintSyncMeta(meta);
    setProgress(100, `Cataleg sincronitzat: ${products.length} fitxes guardades al dispositiu.`);

    const cacheMeta = await readMeta("image-cache");
    if (!cacheMeta || cacheMeta.cachedCount === 0) {
      await cacheAllImages(getVisibleProducts(state.products, state.machinePrefs));
    }
  } catch (error) {
    console.error(error);
    setProgress(0, "No s'ha pogut sincronitzar el cataleg.");
    elements.catalogStatus.textContent = "Error de sincronitzacio";
  } finally {
    state.syncInProgress = false;
    setBusyState();
  }
}

async function cacheAllImages(products) {
  if (state.imageCacheInProgress || products.length === 0) {
    return;
  }

  state.imageCacheInProgress = true;
  setBusyState();

  try {
    const urls = Array.from(new Set(products.flatMap((product) => product.imageUrls).filter(Boolean)));
    const cache = await caches.open(IMAGE_CACHE);
    let completed = 0;

    for (const url of urls) {
      const existing = await cache.match(url);
      if (!existing) {
        const response = await fetch(url, { mode: "cors" });
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      }
      completed += 1;
      setProgress(Math.round((completed / urls.length) * 100), `Descarregant imatges al dispositiu (${completed}/${urls.length})`);
    }

    await writeMeta({
      key: "image-cache",
      cachedCount: urls.length,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    setProgress(0, "Hi ha hagut un problema descarregant les imatges.");
  } finally {
    state.imageCacheInProgress = false;
    setBusyState();
  }
}

async function setMachineAvailability(productId, makeVisible) {
  const payload = {
    id: productId,
    availability: makeVisible ? "active" : "hidden",
    updatedAt: new Date().toISOString()
  };
  await writeMachinePref(payload);
  state.machinePrefs[productId] = payload;
  recomputeDerivedState();
  return payload;
}

async function toggleMachine(productId, makeVisible) {
  await setMachineAvailability(productId, makeVisible);
  renderAll();
}

async function logUsage(product) {
  openLogForm(buildLogContextFromProduct(product));
}

function recomputeDerivedState() {
  const productsById = new Map(state.products.map((product) => [product.id, product]));
  state.usageStats = createUsageStats(state.usageEvents, productsById);
  state.decoratedProducts = decorateRecommendations(state.products, state, state.usageStats);
  state.decoratedBodyweight = decorateRecommendations(getBodyweightLibrary(), state, state.usageStats);
  state.filteredProducts = filterProducts(state.decoratedProducts, state, state.machinePrefs);
}

function renderAll() {
  renderFirstUseWizard();
  renderLogExerciseOptions();
  renderLogQuickPicks();
  renderRecommendations();
  renderWeeklyChecklist();
  renderRoutinePlanner();
  renderFocusMaps();
  renderCatalog();
  renderBodyweight();
  renderHidden();
  renderActiveSession();
  renderPersonalRecords();
  renderHistory();
  syncPlannerModeUI();
  setBusyState();
}

function getBodyweightLibrary() {
  return BODYWEIGHT_EXERCISES.map((exercise) => toBodyweightProduct(exercise));
}

function toBodyweightProduct(exercise) {
  const equipmentSummary = labelForEquipmentSummary(exercise.equipment || []);
  const movementTag = labelForMovementPattern(exercise.movementPattern);
  const replacementTag = labelForReplacement(exercise.machineReplacements?.[0]);
  return {
    id: `bodyweight:${exercise.id}`,
    exerciseId: exercise.id,
    title: exercise.title,
    brand: APP_NAME,
    providerId: "bodyweight",
    description: formatBodyweightDescription(exercise),
    collections: [movementTag, equipmentSummary, replacementTag],
    collectionHandles: ["bodyweight"],
    equipmentType: "bodyweight",
    series: exercise.level || exercise.difficulty,
    muscleGroups: exercise.muscleGroups,
    imageUrls: [exercise.image],
    heroImage: exercise.image,
    searchText: [
      exercise.title,
      exercise.description,
      exercise.muscleGroups.join(" "),
      exercise.movementPattern,
      (exercise.machineReplacements || []).join(" "),
      (exercise.equipment || []).join(" "),
      (exercise.progressions || []).join(" "),
      (exercise.regressions || []).join(" "),
      "sense maquines calistenia bodyweight"
    ].join(" ").toLowerCase(),
    sourceUrl: "",
    updatedAt: "",
    sourceType: "bodyweight",
    movementPattern: exercise.movementPattern,
    machineReplacements: exercise.machineReplacements || [],
    equipment: exercise.equipment || [],
    level: exercise.level || exercise.difficulty,
    progressions: exercise.progressions || [],
    regressions: exercise.regressions || [],
    safetyNotes: exercise.safetyNotes || []
  };
}

function getFilteredBodyweightExercises() {
  if (state.selectedEquipmentType !== "all" && state.selectedEquipmentType !== "bodyweight") {
    return [];
  }

  return state.decoratedBodyweight
    .filter((exercise) => {
      const muscleMatch = matchesSelectedMuscles(exercise.muscleGroups, state.selectedMuscle);
      const searchMatch = !state.searchQuery || exercise.searchText.includes(state.searchQuery);
      return muscleMatch && searchMatch;
    })
    .sort((left, right) => compareProducts(left, right, state));
}

function getRecommendationPool() {
  const bodyweight = getFilteredBodyweightExercises();
  if (state.selectedEquipmentType === "bodyweight") {
    return bodyweight;
  }
  if (state.selectedEquipmentType === "all" && state.selectedBrand === "all") {
    return [...state.filteredProducts, ...bodyweight];
  }
  return state.filteredProducts;
}

function getAlternativePool() {
  return [...getVisibleProducts(state.decoratedProducts, state.machinePrefs), ...state.decoratedBodyweight];
}

function getMachineCardContext() {
  return {
    cardTemplate: elements.cardTemplate,
    escapeHtml,
    formatLastWeightCompact,
    formatSuggestedWeightCompact,
    hasActiveSession: Boolean(state.activeSessionId),
    logUsage,
    openMachineSheet,
    toggleMachine,
    trimSentence
  };
}

function getGuidedPlanContext() {
  return {
    selectedObjective: state.selectedObjective,
    selectedMuscle: state.selectedMuscle,
    selectedEquipmentType: state.selectedEquipmentType,
    selectedBrand: state.selectedBrand,
    searchQuery: state.searchQuery
  };
}

function renderRecommendations() {
  const recommendationPool = getRecommendationPool();
  const alternativePool = getAlternativePool();
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  const activePlan = getActiveSession()?.guidedPlan || null;
  const guidedPlan = getRenderableGuidedPlan(activePlan, alternativePool, routine, getGuidedPlanContext());
  renderTodayPlanView({
    elements,
    activePlan,
    fallbackPlan: guidedPlan,
    routine,
    todayPlanStage: state.todayPlanStage,
    setTodayPlanStage,
    supportsAvailabilityToggle,
    formatSuggestedWeight,
    formatSuggestedWeightCompact,
    formatMinutes,
    formatTransition,
    buildMachineActionSummary,
    escapeHtml
  });
  elements.recommendations.innerHTML = "";

  if (guidedPlan?.steps?.length) {
    const currentStep = getCurrentGuidedStep(guidedPlan);
    guidedPlan.steps.forEach((step) => {
      elements.recommendations.append(buildGuidedPlanCardFragment(step, currentStep?.id === step.id, {
        buildCard: buildMachineCardFragment,
        buildMachineActionSummary,
        escapeHtml,
        formatMinutes,
        formatSuggestedWeightCompact,
        formatTransition,
        machineCardContext: getMachineCardContext()
      }));
    });
  }

  if (recommendationPool.length === 0) {
    const machineOnly = state.selectedEquipmentType === "machine" || state.selectedEquipmentType === "free-weight" || state.selectedEquipmentType === "support";
    elements.summaryText.textContent = state.products.length === 0 && machineOnly
      ? "Sense cataleg local per aquest filtre."
      : "Cap proposta amb aquest filtre.";
    return;
  }

  elements.summaryText.textContent = `${routine.duration.label} - ${routine.exercises.length} exercicis - ${routine.explanation}`;
}

function renderCatalog() {
  elements.catalogGrid.innerHTML = "";
  elements.catalogCount.textContent = `${state.filteredProducts.length} fitxes`;
  elements.emptyState.hidden = state.filteredProducts.length > 0;
  elements.catalogEmptyActions.hidden = state.filteredProducts.length > 0;

  if (state.filteredProducts.length === 0) {
    const hasCatalog = state.products.length > 0;
    const hasActiveFilters = hasSpecificMuscleSelection(state.selectedMuscle)
      || state.selectedEquipmentType !== "all"
      || state.selectedSort !== "recommended"
      || state.selectedBrand !== "all"
      || Boolean(state.searchQuery);

    elements.emptyState.textContent = !hasCatalog
      ? "Encara no hi ha cataleg local."
      : hasActiveFilters
        ? "No hi ha resultats amb aquest filtre."
        : "No hi ha fitxes disponibles ara.";
  }

  for (const product of state.filteredProducts) {
    elements.catalogGrid.append(buildMachineCardFragment(product, { hiddenMode: false, showPrescription: false }, getMachineCardContext()));
  }
}

function renderBodyweight() {
  const visible = getFilteredBodyweightExercises();

  elements.bodyweightGrid.innerHTML = "";
  if (state.selectedEquipmentType !== "all" && state.selectedEquipmentType !== "bodyweight") {
    elements.bodyweightSummary.textContent = "Aquest filtre no encaixa aqui.";
    return;
  }

  elements.bodyweightSummary.textContent = state.usageEvents.length === 0
    ? `${visible.length} exercicis. Via rapida per avui.`
    : `${visible.length} exercicis sense material.`;

  for (const exercise of visible) {
    elements.bodyweightGrid.append(buildMachineCardFragment(exercise, { hiddenMode: false, showPrescription: false, allowToggle: false }, getMachineCardContext()));
  }
}

function renderHidden() {
  const hiddenProducts = getHiddenProducts(state.decoratedProducts, state.machinePrefs);
  elements.hiddenGrid.innerHTML = "";
  elements.hiddenCount.textContent = `${hiddenProducts.length} descartades`;
  elements.hiddenEmptyState.hidden = hiddenProducts.length > 0;
  if (elements.hiddenEmptyActions) {
    elements.hiddenEmptyActions.hidden = hiddenProducts.length > 0;
  }

  for (const product of hiddenProducts) {
    elements.hiddenGrid.append(buildMachineCardFragment(product, { hiddenMode: true, showPrescription: false }, getMachineCardContext()));
  }
}

function renderWeeklyChecklist() {
  const weekly = computeWeeklyChecklist();
  elements.weeklyMuscleGrid.innerHTML = "";
  elements.weeklyInsights.innerHTML = "";
  elements.weeklyAlert.innerHTML = "";

  if (weekly.eventCount === 0) {
    const alert = document.createElement("div");
    alert.className = "weekly-alert__pill";
    alert.textContent = "Checklist corporal per activar";
    elements.weeklyAlert.append(alert);
    elements.weeklyStatus.textContent = "Activa 3 zones avui i evita una setmana en vermell.";
    const card = document.createElement("div");
    card.className = "weekly-pattern weekly-pattern--empty";
    card.innerHTML = `
      <strong>Primera setmana util</strong>
      <span class="summary-text">Comenca per pit, esquena o cames i deixa el mapa en marxa.</span>
      <div class="empty-tag-row">
        ${weekly.items.slice(0, 5).map((item) => `<span class="empty-tag">${escapeHtml(labelForMuscle(item.muscleId))}</span>`).join("")}
      </div>
      <span class="summary-text">Objectiu curt: 20 min, 3 passos i registre al final.</span>
    `;
    elements.weeklyMuscleGrid.append(card);

    [
      "No deixis mes de 2 grups en vermell.",
      "Amb 1 sessio curta ja desbloqueges lectura real de la setmana."
    ].forEach((text) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = text;
      elements.weeklyInsights.append(item);
    });
    return;
  }

  const invalid = weekly.redGroups.length > 2;
  const alert = document.createElement("div");
  alert.className = `weekly-alert__pill ${invalid ? "is-invalid" : "is-valid"}`;
  alert.textContent = invalid
    ? `Setmana invalida: ${weekly.redGroups.length} grups musculars en vermell`
    : `Setmana valida: ${weekly.redGroups.length} grups musculars en vermell`;
  elements.weeklyAlert.append(alert);

  elements.weeklyStatus.textContent = invalid
    ? `Massa zones pendents. El limit es 2 en vermell.`
    : `Cobertura setmanal dins de regla.`;

  for (const item of weekly.items) {
    const card = document.createElement("div");
    card.className = `weekly-muscle-card is-${item.status}`;
    card.innerHTML = `
      <strong>${escapeHtml(labelForMuscle(item.muscleId))}</strong>
      <span class="weekly-muscle-card__count">${item.count} registres aquesta setmana</span>
    `;
    elements.weeklyMuscleGrid.append(card);
  }

  weekly.insights.forEach((text) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.textContent = text;
    elements.weeklyInsights.append(item);
  });
}

function renderFocusMaps() {
  renderDiscoverFocusMap();
  renderPlannerFocusMap();
  renderLogFocusMap();
  renderWeeklyFocusMap();
}

function renderDiscoverFocusMap() {
  const selectedIds = getSelectedMuscleIds(state.selectedMuscle);
  const selectedMuscles = musclesForVisualFocus(selectedIds.length === 0 ? CHECKLIST_MUSCLE_GROUPS : selectedIds);
  paintFocusMap(elements.discoverFocusMap, selectedMuscles, "accent");
  if (elements.discoverFocusLabel) {
    elements.discoverFocusLabel.textContent = selectedMuscleFilterLabel(state.selectedMuscle);
  }
  if (elements.discoverFocusCopy) {
    elements.discoverFocusCopy.textContent = selectedMuscleFilterCopy(state.selectedMuscle);
  }
}

function renderPlannerFocusMap() {
  const template = findExerciseTemplate(String(elements.exerciseTemplate?.value || "").trim());
  const primary = String(elements.exercisePrimaryMuscle?.value || template?.primaryMuscle || "");
  const secondary = Array.from(elements.exerciseSecondaryMuscles?.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
  const selectedMuscles = musclesForVisualFocus([primary, ...secondary]);
  paintFocusMap(elements.plannerFocusMap, selectedMuscles, "accent");
  if (elements.plannerFocusLabel) {
    elements.plannerFocusLabel.textContent = template?.name || (elements.exerciseTemplate?.value === "__custom__" ? "Exercici personalitzat" : "Tria una plantilla");
  }
  if (elements.plannerFocusCopy) {
    elements.plannerFocusCopy.textContent = template
      ? `${labelForMuscle(primary)} com a focus principal.`
      : elements.exerciseTemplate?.value === "__custom__"
        ? "Activa nomes els camps que realment necessites."
        : "La plantilla t'omple la base i tu ajustes.";
  }
}

function renderLogFocusMap() {
  const context = state.pendingLogContext;
  const selectedMuscles = musclesForVisualFocus(context?.muscleGroups || []);
  paintFocusMap(elements.logFocusMap, selectedMuscles, context ? "accent" : "neutral");
  if (elements.logFocusLabel) {
    elements.logFocusLabel.textContent = context?.title || "Cap exercici triat";
  }
  if (elements.logFocusCopy) {
    elements.logFocusCopy.textContent = context
      ? `${labelForMuscle(pickPrimaryMuscle(context.muscleGroups))} en primer pla.`
      : "Tens accessos rapids just a sobre.";
  }
}

function renderWeeklyFocusMap() {
  const weekly = computeWeeklyChecklist();
  if (weekly.eventCount === 0) {
    paintFocusMap(elements.weeklyFocusMap, CHECKLIST_MUSCLE_GROUPS, "neutral");
  if (elements.weeklyFocusLabel) {
      elements.weeklyFocusLabel.textContent = "Checklist del cos encara buit";
    }
    if (elements.weeklyFocusCopy) {
      elements.weeklyFocusCopy.textContent = "Activa les primeres zones i fes visible el patro de la setmana.";
    }
    return;
  }
  const pending = weekly.redGroups.map((item) => item.muscleId);
  const highlighted = pending.length > 0
    ? musclesForVisualFocus(pending)
    : musclesForVisualFocus(weekly.items.filter((item) => item.count > 0).map((item) => item.muscleId));
  paintFocusMap(elements.weeklyFocusMap, highlighted, pending.length > 0 ? "pending" : "success");
  if (elements.weeklyFocusLabel) {
    elements.weeklyFocusLabel.textContent = pending.length > 0 ? `${pending.length} zones pendents` : "Cobertura activa";
  }
  if (elements.weeklyFocusCopy) {
    elements.weeklyFocusCopy.textContent = pending.length > 0
      ? pending.map((muscle) => labelForMuscle(muscle).toLowerCase()).join(" / ")
      : "El cos ja te treball registrat aquesta setmana.";
  }
}

function paintFocusMap(host, muscles, tone = "accent") {
  if (!host) {
    return;
  }

  if (host.dataset.preview === "avatar") {
    paintAvatarPreview(host, muscles, tone);
    return;
  }

  if (!state.bodyMapMarkup) {
    return;
  }

  if (!host.firstElementChild) {
    host.innerHTML = state.bodyMapMarkup;
    const svg = host.querySelector("svg");
    if (svg) {
      svg.classList.add("body-map");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("focusable", "false");
    }
  }

  const activeMuscles = new Set(muscles || []);
  const toneColor = tone === "warning"
    ? "rgb(174 92 56)"
    : tone === "success"
      ? "rgb(96 132 104)"
      : tone === "pending"
        ? "rgb(150 167 153)"
      : tone === "neutral"
        ? "rgb(122 138 151)"
        : "rgb(207 118 64)";

  host.querySelectorAll("[data-region]").forEach((part) => {
    const muscle = part.dataset.region;
    if (muscle === "all") {
      part.style.opacity = activeMuscles.size > 0 ? "0.42" : "0.22";
      return;
    }
    const shapes = part.querySelectorAll(".region");
    const active = activeMuscles.has(muscle);
    shapes.forEach((shape) => {
      shape.style.fill = toneColor;
      shape.style.fillOpacity = active ? "0.78" : "0";
    });
  });
}

function paintAvatarPreview(host, muscles, tone) {
  const selected = muscles?.length ? muscles : ["all"];
  const primary = selected[0] || "all";
  host.innerHTML = buildFocusAvatarMarkup(selected, primary, tone);
}

function renderRoutinePlanner() {
  elements.routineDayGrid.innerHTML = "";
  const totalEntries = state.routineDays.reduce((sum, day) => sum + day.entries.length, 0);
  const plannedCoverage = computePlannedCoverage();
  elements.plannerStatus.textContent = totalEntries === 0
    ? "Cap exercici planificat."
    : plannedCoverage.redGroups.length > 2
      ? `${state.routineDays.length} dies - ${totalEntries} exercicis - pla invalid (${plannedCoverage.redGroups.length} grups sense cobrir).`
      : `${state.routineDays.length} dies - ${totalEntries} exercicis - cobertura correcta.`;

  for (const day of state.routineDays) {
    const card = document.createElement("div");
    card.className = "routine-day-card";
    const plannedMuscles = Array.from(new Set(day.entries.flatMap((entry) => entry.muscleGroups || [])))
      .filter((muscle) => muscle !== "all")
      .map((muscle) => labelForMuscle(muscle))
      .join(", ");

    card.innerHTML = `
      <strong>${escapeHtml(day.label)}</strong>
      <span class="session-item__meta">${day.entries.length} exercicis${plannedMuscles ? ` - ${escapeHtml(plannedMuscles)}` : ""}</span>
    `;

    for (const entry of day.entries) {
      const entryNode = document.createElement("div");
      entryNode.className = "routine-entry";
      entryNode.innerHTML = `
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="session-item__meta">${formatRoutineEntry(entry)}</span>
        <div class="machine-card__actions">
          <button class="button button--primary" type="button">Fet avui</button>
          <button class="button button--ghost" type="button">Elimina</button>
        </div>
      `;
      const [logButton, removeButton] = entryNode.querySelectorAll("button");
      logButton.addEventListener("click", () => logRoutineEntry(day.id, entry.id));
      removeButton.addEventListener("click", () => removeRoutineEntry(day.id, entry.id));
      card.append(entryNode);
    }

    elements.routineDayGrid.append(card);
  }
}

function computePlannedCoverage() {
  const counts = Object.fromEntries(CHECKLIST_MUSCLE_GROUPS.map((muscleId) => [muscleId, 0]));
  state.routineDays.forEach((day) => {
    const musclesForDay = new Set(day.entries.flatMap((entry) => entry.muscleGroups || []));
    musclesForDay.forEach((muscle) => {
      if (counts[muscle] !== undefined) {
        counts[muscle] += 1;
      }
    });
  });
  const redGroups = Object.entries(counts)
    .filter(([, count]) => count === 0)
    .map(([muscle]) => muscle);
  return { counts, redGroups };
}

function renderActiveSession() {
  const activeSession = getActiveSession();
  const latestCompleted = state.sessions.find((session) => session.endedAt);
  elements.activeSessionList.innerHTML = "";
  elements.completedSessionList.innerHTML = "";

  elements.activeSessionStart.disabled = Boolean(activeSession);
  elements.activeSessionEnd.disabled = !activeSession;
  elements.copyLastSession.disabled = Boolean(activeSession) || !latestCompleted;
  elements.activeSessionEnd.hidden = !activeSession;
  elements.copyLastSession.hidden = Boolean(activeSession) || !latestCompleted;

  if (!activeSession) {
    elements.sessionStatus.textContent = "Cap sessio activa.";
    elements.activeSessionSummary.textContent = "Quan arrenquis una sessio, el resum surt aqui.";
    const empty = document.createElement("div");
    empty.className = "session-item";
    empty.innerHTML = `
      <strong>Cap registre en curs</strong>
      <span class="session-item__meta">Inicia sessio o guarda un exercici solt.</span>
    `;
    elements.activeSessionList.append(empty);
  } else {
    const started = new Date(activeSession.startedAt);
    const loggedEntries = activeSession.entries.filter((entry) => !entry.copied);
    const copiedEntries = activeSession.entries.filter((entry) => entry.copied);
    const guidedCurrent = getCurrentGuidedStep(activeSession.guidedPlan);
    const volume = loggedEntries.reduce((sum, entry) => {
      const sets = Number(entry.sets) || 0;
      const reps = parseAverageReps(entry.reps);
      const weight = Number(entry.weightKg) || 0;
      return sum + sets * reps * weight;
    }, 0);

    elements.sessionStatus.textContent = `Sessio activa des de ${started.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}`;
    elements.activeSessionSummary.textContent = copiedEntries.length > 0
      ? `${loggedEntries.length} exercicis registrats - ${copiedEntries.length} pendents d'una sessio copiada - volum estimat ${Math.round(volume)} kg`
      : guidedCurrent
        ? `${loggedEntries.length} exercicis registrats - pas actual ${guidedCurrent.position}/${guidedCurrent.totalSteps}: ${guidedCurrent.title} - volum estimat ${Math.round(volume)} kg`
        : `${loggedEntries.length} exercicis registrats - volum estimat ${Math.round(volume)} kg`;

    for (const entry of activeSession.entries) {
      const item = document.createElement("div");
      item.className = "session-item";
      item.innerHTML = `
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="session-item__meta">${entry.copied ? "Plantilla copiada; registra-la quan la facis." : formatSessionEntry(entry)}</span>
      `;
      elements.activeSessionList.append(item);
    }
  }

  const completedSessions = state.sessions.filter((item) => item.endedAt).slice(0, 5);
  if (completedSessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-item";
    empty.innerHTML = `
      <strong>Sense sessions tancades</strong>
      <span class="session-item__meta">La primera apareixera aqui.</span>
    `;
    elements.completedSessionList.append(empty);
  } else {
    for (const session of completedSessions) {
      const item = document.createElement("div");
      item.className = "session-item";
      item.innerHTML = `
        <strong>${new Date(session.startedAt).toLocaleDateString("ca-ES")}</strong>
        <span class="session-item__meta">${session.entries.length} exercicis - objectiu ${labelForObjective(session.objective)}</span>
        <div class="machine-card__actions">
          <button class="button button--secondary" type="button">Edita</button>
          <button class="button button--ghost" type="button">Esborra</button>
        </div>
      `;
      const [editButton, deleteButton] = item.querySelectorAll("button");
      editButton.addEventListener("click", () => openCompletedSessionEditor(session.id));
      deleteButton.addEventListener("click", () => handleCompletedSessionDelete(session.id));
      elements.completedSessionList.append(item);
    }
  }

  renderCompletedSessionEditor();
}

function openCompletedSessionEditor(sessionId) {
  const session = state.sessions.find((entry) => entry.id === sessionId && entry.endedAt);
  if (!session) {
    return;
  }
  state.editingCompletedSessionId = sessionId;
  state.editingCompletedSessionDraft = {
    ...session,
    entries: session.entries.map((entry) => ({ ...entry }))
  };
  renderAll();
}

function closeCompletedSessionEditor() {
  state.editingCompletedSessionId = null;
  state.editingCompletedSessionDraft = null;
  renderAll();
}

function renderCompletedSessionEditor() {
  const draft = state.editingCompletedSessionDraft;
  if (!elements.completedSessionEditor || !elements.completedSessionEntryList || !elements.completedSessionEditorSummary) {
    return;
  }

  elements.completedSessionEditor.hidden = !draft;
  if (!draft) {
    elements.completedSessionEntryList.innerHTML = "";
    return;
  }

  setSelectValue(elements.completedSessionObjective, draft.objective || "hypertrophy", labelForObjective(draft.objective || "hypertrophy"));
  elements.completedSessionEditorSummary.textContent = `${new Date(draft.startedAt).toLocaleString("ca-ES")} - ${draft.entries.length} exercicis registrats.`;
  elements.completedSessionEntryList.innerHTML = "";
  const exerciseOptions = getLoggableExerciseContexts().map((context) => ({ value: context.title, label: context.title }));

  draft.entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "session-item session-item--editable";
    item.innerHTML = `
      <div class="planner-form__row">
        <label class="toolbar__field">
          <span>Exercici</span>
          <select data-entry-id="${entry.id}" data-field="title">
            ${buildSelectMarkup(exerciseOptions, entry.title || "", entry.title || "")}
          </select>
        </label>
        <label class="toolbar__field">
          <span>Series</span>
          <select data-entry-id="${entry.id}" data-field="sets">
            ${buildSelectMarkup(SET_SELECT_OPTIONS, entry.sets || "")}
          </select>
        </label>
        <label class="toolbar__field">
          <span>Reps / temps</span>
          <select data-entry-id="${entry.id}" data-field="reps">
            ${buildSelectMarkup(REP_SELECT_OPTIONS, entry.reps || "", entry.reps || "")}
          </select>
        </label>
      </div>
      <div class="planner-form__row">
        <label class="toolbar__field">
          <span>Pes kg</span>
          <select data-entry-id="${entry.id}" data-field="weightKg">
            ${buildSelectMarkup(WEIGHT_SELECT_OPTIONS, entry.weightKg ?? "", entry.weightKg ?? "")}
          </select>
        </label>
        <label class="toolbar__field">
          <span>Musculs</span>
          <input type="text" value="${escapeHtml((entry.muscleGroups || []).map((muscle) => labelForMuscle(muscle)).join(", "))}" disabled>
        </label>
        <div class="machine-card__actions">
          <button class="button button--ghost" type="button" data-remove-session-entry="${entry.id}">Elimina exercici</button>
        </div>
      </div>
      <label class="toolbar__field">
        <span>Notes</span>
        <select data-entry-id="${entry.id}" data-field="notes">
          ${buildSelectMarkup(NOTE_SELECT_OPTIONS, entry.notes || "", entry.notes || "")}
        </select>
      </label>
      <span class="session-item__meta">Pas ${index + 1} - ${entry.addedAt ? new Date(entry.addedAt).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : "hora no disponible"}</span>
    `;
    elements.completedSessionEntryList.append(item);
  });
}

function handleCompletedSessionFormInput(event) {
  const draft = state.editingCompletedSessionDraft;
  if (!draft) {
    return;
  }

  if (event.target === elements.completedSessionObjective) {
    draft.objective = elements.completedSessionObjective.value;
    return;
  }

  const entryId = event.target.dataset.entryId;
  const field = event.target.dataset.field;
  if (!entryId || !field) {
    return;
  }

  const entry = draft.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  if (field === "title") {
    const selectedContext = resolveLogContextFromInput(getLoggableExerciseContexts(), event.target.value);
    entry.title = String(event.target.value || "");
    if (selectedContext) {
      entry.title = selectedContext.title;
      entry.exerciseId = selectedContext.exerciseId || selectedContext.productId;
      entry.muscleGroups = selectedContext.muscleGroups || [];
      entry.equipmentType = selectedContext.equipmentType || entry.equipmentType;
      entry.sourceType = selectedContext.sourceType || entry.sourceType;
      if (!entry.sets && selectedContext.defaultSets) {
        entry.sets = selectedContext.defaultSets;
      }
      if (!entry.reps && selectedContext.defaultReps) {
        entry.reps = selectedContext.defaultReps;
      }
      if (!entry.notes && selectedContext.defaultNotes) {
        entry.notes = selectedContext.defaultNotes;
      }
      if (typeof entry.weightKg !== "number" && typeof selectedContext.defaultWeightKg === "number") {
        entry.weightKg = selectedContext.defaultWeightKg;
      }
    }
    renderCompletedSessionEditor();
    return;
  }

  entry[field] = field === "weightKg" ? parseOptionalNumber(event.target.value) : String(event.target.value || "");
}

function handleCompletedSessionFormClick(event) {
  const entryButton = event.target.closest("[data-remove-session-entry]");
  if (!entryButton || !state.editingCompletedSessionDraft) {
    return;
  }

  state.editingCompletedSessionDraft.entries = state.editingCompletedSessionDraft.entries.filter((entry) => entry.id !== entryButton.dataset.removeSessionEntry);
  renderCompletedSessionEditor();
}

async function handleCompletedSessionFormSubmit(event) {
  event.preventDefault();
  const draft = state.editingCompletedSessionDraft;
  if (!draft) {
    return;
  }

  const normalizedEntries = draft.entries
    .map((entry) => ({
      ...entry,
      title: String(entry.title || "").trim(),
      sets: String(entry.sets || "").trim(),
      reps: String(entry.reps || "").trim(),
      notes: String(entry.notes || "").trim(),
      weightKg: typeof entry.weightKg === "number" ? entry.weightKg : parseOptionalNumber(entry.weightKg)
    }))
    .filter((entry) => entry.title);

  const session = {
    ...draft,
    objective: draft.objective || "hypertrophy",
    entries: normalizedEntries,
    updatedAt: new Date().toISOString()
  };
  const usageEvents = buildUsageEventsFromSession(session);

  await replaceSessionUsageEvents(session, usageEvents);
  syncSessionInState(session);
  state.usageEvents = [
    ...state.usageEvents.filter((entry) => entry.sessionId !== session.id),
    ...usageEvents
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  state.editingCompletedSessionId = null;
  state.editingCompletedSessionDraft = null;
  recomputeDerivedState();
  renderAll();
}

async function handleCompletedSessionDelete(sessionId = state.editingCompletedSessionId) {
  const targetId = sessionId || state.editingCompletedSessionId;
  if (!targetId) {
    return;
  }

  const target = state.sessions.find((session) => session.id === targetId);
  if (!target) {
    return;
  }

  const confirmed = window.confirm(`Esborrar la sessio del ${new Date(target.startedAt).toLocaleDateString("ca-ES")} i els seus registres associats?`);
  if (!confirmed) {
    return;
  }

  await deleteSessionCascade(targetId);
  state.sessions = state.sessions.filter((session) => session.id !== targetId);
  state.usageEvents = state.usageEvents.filter((entry) => entry.sessionId !== targetId);
  if (state.editingCompletedSessionId === targetId) {
    state.editingCompletedSessionId = null;
    state.editingCompletedSessionDraft = null;
  }
  recomputeDerivedState();
  renderAll();
}

function buildUsageEventsFromSession(session) {
  return session.entries.map((entry, index) => {
    const timestamp = entry.addedAt || new Date(new Date(session.startedAt).getTime() + index * 60000).toISOString();
    const date = new Date(timestamp);
    return {
      id: crypto.randomUUID(),
      productId: entry.exerciseId || entry.id,
      productTitle: entry.title,
      muscleGroups: entry.muscleGroups || [],
      objective: session.objective,
      weightKg: typeof entry.weightKg === "number" ? entry.weightKg : parseOptionalNumber(entry.weightKg),
      sets: entry.sets || "",
      reps: entry.reps || "",
      notes: entry.notes || "",
      sessionId: session.id,
      createdAt: timestamp,
      dateKey: getLocalDateKey(date)
    };
  });
}

function renderPersonalRecords() {
  const records = computePersonalRecords();
  elements.prList.innerHTML = "";

  if (records.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pr-item";
    empty.textContent = "Encara no hi ha PRs.";
    elements.prList.append(empty);
    return;
  }

  for (const record of records.slice(0, 8)) {
    const item = document.createElement("div");
    item.className = "pr-item";
    item.innerHTML = `
      <strong>${escapeHtml(record.title)}</strong>
      <span class="pr-item__meta">Millor pes ${record.bestWeightKg} kg${record.bestReps ? ` - ${record.bestReps}` : ""}</span>
    `;
    elements.prList.append(item);
  }
}

async function handleExerciseFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const templateId = String(formData.get("templateId") || "").trim();
  const template = findExerciseTemplate(templateId);
  const name = String(formData.get("customName") || "").trim() || template?.name || "";
  const primaryMuscle = String(formData.get("primaryMuscle") || template?.primaryMuscle || "").trim();
  const dayId = String(formData.get("dayId") || "").trim();

  if (!name || !primaryMuscle || !dayId) {
    return;
  }

  const selectedSecondary = Array.from(elements.exerciseSecondaryMuscles.selectedOptions)
    .map((option) => option.value)
    .filter((value) => value && value !== primaryMuscle);

  const customExercise = {
    id: crypto.randomUUID(),
    name,
    gymArea: String(formData.get("gymArea") || template?.gymArea || "").trim(),
    primaryMuscle,
    secondaryMuscles: selectedSecondary,
    sets: String(formData.get("sets") || template?.sets || "").trim(),
    reps: String(formData.get("reps") || template?.reps || "").trim(),
    weightKg: parseOptionalNumber(formData.get("weightKg")),
    notes: String(formData.get("notes") || template?.notes || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await writeCustomExercise(customExercise);
  state.customExercises.unshift(customExercise);

  const day = getRoutineDay(dayId);
  if (!day) {
    return;
  }

  day.entries.push({
    id: crypto.randomUUID(),
    exerciseId: customExercise.id,
    title: customExercise.name,
    gymArea: customExercise.gymArea,
    muscleGroups: [customExercise.primaryMuscle, ...customExercise.secondaryMuscles],
    sets: customExercise.sets,
    reps: customExercise.reps,
    weightKg: customExercise.weightKg,
    notes: customExercise.notes
  });
  day.updatedAt = new Date().toISOString();
  await persistRoutineDay(day);

  form.reset();
  togglePlannerCustomNameField(false);
  togglePlannerDetails(false);
  elements.exerciseDay.value = dayId;
  setMultiSelectValues(elements.exerciseSecondaryMuscles, []);
  updatePlannerSubmitState();
  renderFocusMaps();
  recomputeDerivedState();
  renderAll();
}

function renderLogExerciseOptions() {
  if (!elements.logFormExercise) {
    return;
  }

  const contexts = getLoggableExerciseContexts();
  elements.logFormExercise.innerHTML = [
    `<option value="">Selecciona un exercici conegut</option>`,
    ...contexts.map((context) => `<option value="${escapeHtml(context.title)}">${escapeHtml(context.title)}</option>`)
  ]
    .join("");
}

function getLoggableExerciseContexts() {
  return buildLoggableExerciseContexts({
    bodyweightContexts: getBodyweightLibrary().map((exercise) => buildLogContextFromProduct(exercise)),
    visibleProductContexts: getVisibleProducts(state.products, state.machinePrefs).map((product) => buildLogContextFromProduct(product)),
    customExercises: state.customExercises,
    routineDays: state.routineDays
  });
}

function handleLogExerciseInput() {
  elements.logNextActions.hidden = true;
  const rawValue = String(elements.logFormExercise.value || "").trim();
  if (!rawValue) {
    state.pendingLogContext = null;
    elements.logFormSubmit.disabled = true;
    elements.logFormStatus.textContent = "Tria un exercici per guardar.";
    renderFocusMaps();
    return;
  }

  const context = resolveLogContextFromInput(getLoggableExerciseContexts(), rawValue);
  if (!context) {
    state.pendingLogContext = null;
    elements.logFormSubmit.disabled = true;
    elements.logFormStatus.textContent = "Exercici no reconegut.";
    renderFocusMaps();
    return;
  }

  state.pendingLogContext = context;
  if (!elements.logFormSets.value) {
    setSelectValue(elements.logFormSets, context.defaultSets || "");
  }
  if (!elements.logFormReps.value) {
    setSelectValue(elements.logFormReps, context.defaultReps || "");
  }
  if (!elements.logFormNotes.value) {
    setSelectValue(elements.logFormNotes, context.defaultNotes || "");
  }
  if (!elements.logFormWeight.value && typeof context.defaultWeightKg === "number") {
    setSelectValue(elements.logFormWeight, context.defaultWeightKg);
  }
  elements.logFormSubmit.disabled = false;
  elements.logFormStatus.textContent = state.activeSessionId
    ? `${context.title} llest per a la sessio activa.`
    : `${context.title} llest per guardar.`;
  renderFocusMaps();
}

async function handleLogFormSubmit(event) {
  event.preventDefault();
  if (!state.pendingLogContext) {
    handleLogExerciseInput();
  }
  if (!state.pendingLogContext) {
    return;
  }

  const details = {
    sets: String(elements.logFormSets.value || "").trim() || null,
    reps: String(elements.logFormReps.value || "").trim() || null,
    notes: String(elements.logFormNotes.value || "").trim(),
    weightKg: parseOptionalNumber(elements.logFormWeight.value)
  };
  const guidedPlanStepId = state.pendingLogContext.guidedPlanStepId || null;

  await persistUsageEvent(state.pendingLogContext, details);
  if (guidedPlanStepId) {
    await completeGuidedPlanStep(guidedPlanStepId, details);
    await dismissFirstUseWizard("first-log");
    clearLogForm("Pas guardat. Continua amb el seguent.");
    recomputeDerivedState();
    renderAll();
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-recommendations" } }));
    return;
  }
  await dismissFirstUseWizard("first-log");
  clearLogForm("Registre guardat al dispositiu.");
  elements.logNextActions.hidden = false;
  recomputeDerivedState();
  renderAll();
}

async function removeRoutineEntry(dayId, entryId) {
  const day = getRoutineDay(dayId);
  if (!day) {
    return;
  }
  day.entries = day.entries.filter((entry) => entry.id !== entryId);
  day.updatedAt = new Date().toISOString();
  await persistRoutineDay(day);
  renderAll();
}

async function logRoutineEntry(dayId, entryId) {
  const day = getRoutineDay(dayId);
  const entry = day?.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  openLogForm({
    productId: `custom:${entry.exerciseId}`,
    exerciseId: entry.exerciseId,
    title: entry.title,
    muscleGroups: entry.muscleGroups,
    equipmentType: "custom",
    sourceType: "planner",
    defaultSets: entry.sets || "",
    defaultReps: entry.reps || "",
    defaultNotes: entry.notes || "",
    defaultWeightKg: typeof entry.weightKg === "number" ? entry.weightKg : null
  });
}

function buildLogContextFromProduct(product) {
  return {
    productId: product.id,
    exerciseId: product.exerciseId || product.id,
    title: product.title,
    muscleGroups: product.muscleGroups,
    equipmentType: product.equipmentType,
    sourceType: product.sourceType || "catalog",
    defaultSets: "",
    defaultReps: product.prescription || "",
    defaultNotes: "",
    defaultWeightKg: state.usageStats.lastWeightByProduct[product.id]?.weightKg ?? null
  };
}

function openLogForm(context) {
  state.pendingLogContext = context;
  elements.logNextActions.hidden = true;
  setSelectValue(elements.logFormExercise, context.title, context.title);
  setSelectValue(elements.logFormSets, context.defaultSets || "");
  setSelectValue(elements.logFormReps, context.defaultReps || "", context.defaultReps || "");
  setSelectValue(elements.logFormWeight, typeof context.defaultWeightKg === "number" ? context.defaultWeightKg : "");
  setSelectValue(elements.logFormNotes, context.defaultNotes || "");
  elements.logFormSubmit.disabled = false;
  elements.logFormStatus.textContent = state.activeSessionId
    ? `${context.title} anira a la sessio activa.`
    : `${context.title} anira a l'historic.`;
  renderFocusMaps();
  window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-log" } }));
  requestAnimationFrame(() => {
    elements.logFormSets.focus();
  });
}

function clearLogForm(statusText) {
  state.pendingLogContext = null;
  elements.logForm.reset();
  setSelectValue(elements.logFormExercise, "");
  setSelectValue(elements.logFormSets, "");
  setSelectValue(elements.logFormReps, "");
  setSelectValue(elements.logFormWeight, "");
  setSelectValue(elements.logFormNotes, "");
  elements.logNextActions.hidden = true;
  elements.logFormSubmit.disabled = true;
  elements.logFormStatus.textContent = statusText || "Tria un exercici per guardar.";
  renderFocusMaps();
}

function handleLogNextActionsClick(event) {
  const sectionButton = event.target.closest("[data-next-section]");
  if (sectionButton) {
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: sectionButton.dataset.nextSection } }));
    return;
  }

  if (event.target.closest("[data-log-reset]")) {
    clearLogForm();
    elements.logFormExercise.focus();
  }
}

async function persistUsageEvent(context, details) {
  const now = new Date();
  const event = {
    id: crypto.randomUUID(),
    productId: context.productId,
    productTitle: context.title,
    muscleGroups: context.muscleGroups,
    objective: state.selectedObjective,
    weightKg: details.weightKg,
    sets: details.sets,
    reps: details.reps,
    notes: details.notes,
    sessionId: state.activeSessionId,
    createdAt: now.toISOString(),
    dateKey: getLocalDateKey(now)
  };

  const activeSession = getActiveSession();
  if (activeSession) {
    activeSession.entries.unshift({
      id: crypto.randomUUID(),
      addedAt: now.toISOString(),
      exerciseId: context.productId,
      title: context.title,
      muscleGroups: context.muscleGroups,
      equipmentType: context.equipmentType,
      sourceType: context.sourceType,
      sets: details.sets,
      reps: details.reps,
      notes: details.notes,
      weightKg: details.weightKg
    });
    await writeUsageEventAndSession(event, activeSession);
    syncSessionInState(activeSession);
  } else {
    await writeUsageEvent(event);
  }

  state.usageEvents.unshift(event);
}

function renderHistory() {
  const calendar = buildCalendarDays(state.usageStats);
  const hasHistory = state.usageStats.total > 0;
  elements.calendarTitle.textContent = calendar.title;
  elements.historyCalendar.innerHTML = "";
  if (elements.historyCalendarCard) {
    elements.historyCalendarCard.hidden = !hasHistory;
  }

  for (const day of calendar.days) {
    const cell = document.createElement("div");
    cell.className = `calendar-cell${day.empty ? " calendar-cell--empty" : ""}`;
    if (!day.empty) {
      cell.textContent = day.dayNumber;
      cell.dataset.level = String(Math.min(day.count, 4));
      cell.title = `${day.dateKey}: ${day.count} usos`;
    }
    elements.historyCalendar.append(cell);
  }

  elements.historyList.innerHTML = "";
  const recent = state.usageEvents.slice(0, 10);
  if (recent.length === 0) {
    const item = document.createElement("div");
    item.className = "history-item history-item--empty";
    item.innerHTML = `
      <strong>Encara no hi ha patro personal</strong>
      <span>Guarda el primer exercici i desbloqueja pes, reps i mapa corporal.</span>
      <div class="empty-tag-row">
        <span class="empty-tag">Pes</span>
        <span class="empty-tag">Series</span>
        <span class="empty-tag">Reps</span>
        <span class="empty-tag">Equilibri</span>
      </div>
    `;
    elements.historyList.append(item);
  }
  for (const event of recent) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${escapeHtml(event.productTitle)}</strong>
      <span>${new Date(event.createdAt).toLocaleString("ca-ES")} - ${labelForObjective(event.objective)}${typeof event.weightKg === "number" ? ` - ${event.weightKg} kg` : ""}</span>
    `;
    elements.historyList.append(item);
  }

  elements.historySummary.textContent = hasHistory
    ? `${state.usageStats.total} usos registrats. Recomanacions ajustades al teu historic.`
    : "Sense historial encara. Guarda el primer exercici i crea la primera referencia.";

  renderBalanceMap();
}

function handleMachineSheetClick(event) {
  if (!event.target.closest("[data-sheet-close]")) {
    return;
  }
  closeMachineSheet();
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape" && elements.machineSheetModal && !elements.machineSheetModal.hidden) {
    closeMachineSheet();
  }
}

async function openMachineSheet(product) {
  if (!elements.machineSheetModal) {
    if (product.sourceUrl) {
      window.open(product.sourceUrl, "_blank", "noopener");
    }
    return;
  }

  showMachineSheetChrome(product);

  const cached = state.machineSheetCache[product.id];
  if (cached) {
    renderMachineSheetView(elements, product, cached, escapeHtml);
    return;
  }

  const provider = CATALOG_PROVIDERS.find((entry) => entry.id === product.providerId);
  if (!provider) {
    renderMachineSheetErrorView(elements, product, escapeHtml);
    return;
  }

  const requestToken = ++state.machineSheetRequestToken;

  try {
    const sheet = await fetchProductInstructionSheet(product, provider);
    if (requestToken !== state.machineSheetRequestToken || elements.machineSheetModal.hidden) {
      return;
    }
    state.machineSheetCache[product.id] = sheet;
    renderMachineSheetView(elements, product, sheet, escapeHtml);
  } catch (error) {
    console.error(error);
    if (requestToken !== state.machineSheetRequestToken || elements.machineSheetModal.hidden) {
      return;
    }
    renderMachineSheetErrorView(elements, product, escapeHtml);
  }
}

function showMachineSheetChrome(product) {
  elements.machineSheetModal.hidden = false;
  elements.machineSheetModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-sheet-open");
  elements.machineSheetTitle.textContent = product.title;
  elements.machineSheetSubtitle.textContent = `${labelForEquipmentType(product.equipmentType)} - ${product.series || product.brand}`;
  elements.machineSheetStatus.hidden = false;
  elements.machineSheetStatus.textContent = "Buscant l'esquema d'instruccions...";
  elements.machineSheetBody.innerHTML = "";
  elements.machineSheetSource.hidden = !product.sourceUrl;
  if (product.sourceUrl) {
    elements.machineSheetSource.href = product.sourceUrl;
  } else {
    elements.machineSheetSource.removeAttribute("href");
  }
}

function closeMachineSheet() {
  if (!elements.machineSheetModal || elements.machineSheetModal.hidden) {
    return;
  }

  state.machineSheetRequestToken += 1;
  elements.machineSheetModal.hidden = true;
  elements.machineSheetModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-sheet-open");
  elements.machineSheetBody.innerHTML = "";
  elements.machineSheetStatus.hidden = false;
  elements.machineSheetStatus.textContent = "";
}



function paintSyncMeta(meta) {
  if (!meta) {
    return;
  }
  const date = new Date(meta.lastSyncedAt);
  elements.catalogStatus.textContent = `Sincronitzat ${date.toLocaleString("ca-ES")}`;
}

function updateOfflineIndicator() {
  if (!("serviceWorker" in navigator)) {
    elements.offlineStatus.textContent = navigator.onLine ? "Sense cache offline" : "Offline limitat";
    return;
  }

  if (state.serviceWorkerReady) {
    elements.offlineStatus.textContent = navigator.onLine ? "Offline preparat" : "Offline actiu";
    return;
  }

  elements.offlineStatus.textContent = navigator.onLine ? "Preparant offline" : "Offline sense shell";
}

function initTimers() {
  renderSessionClock();
  renderRestClock(0);
}

function rehydrateActiveSessionTimer() {
  const activeSession = getActiveSession();
  if (!activeSession) {
    state.sessionElapsedMs = 0;
    state.sessionStartedAt = null;
    renderSessionClock();
    return;
  }

  state.sessionStartedAt = new Date(activeSession.startedAt).getTime();
  state.sessionElapsedMs = Math.max(0, Date.now() - state.sessionStartedAt);
  if (!state.sessionTimerId) {
    startSessionTimer();
  }
}

function setBusyState() {
  elements.syncButton.disabled = state.syncInProgress || state.imageCacheInProgress;
  elements.cacheImagesButton.disabled = state.syncInProgress || state.imageCacheInProgress || state.products.length === 0;
}

function setProgress(percentage, text) {
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressText.textContent = text;
}

function paintSectionContext(sectionId) {
  if (state.syncInProgress || state.imageCacheInProgress) {
    return;
  }
  const context = SECTION_CONTEXT[sectionId] || SECTION_CONTEXT["section-discover"];
  setProgress(context.progress, context.text);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    state.serviceWorkerReady = true;
    updateOfflineIndicator();
  });

  Promise.resolve()
    .then(async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        state.serviceWorkerReady = Boolean(navigator.serviceWorker.controller || registration.active || registration.waiting);
        updateOfflineIndicator();
        await navigator.serviceWorker.ready;
        state.serviceWorkerReady = true;
        updateOfflineIndicator();
      } catch (error) {
        console.error("No s'ha pogut registrar el service worker.", error);
      }
    });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatSuggestedWeight(product) {
  const weight = product?.suggestedWeightKg;
  if (typeof weight !== "number") {
    return "";
  }
  if (product.loadSystem === "plate_loaded") {
    const baseText = typeof product.baseResistanceKg === "number" ? ` + palanca base ~${product.baseResistanceKg} kg` : "";
    return ` - Pes suggerit ${weight} kg en discs${baseText}`;
  }
  if (product.loadSystem === "stack") {
    return ` - Pes suggerit ${weight} kg de stack`;
  }
  if (product.loadSystem === "free_weight") {
    return ` - Pes suggerit ${weight} kg de pes lliure`;
  }
  return ` - Pes suggerit ${weight} kg`;
}

function formatSuggestedWeightCompact(product) {
  const weight = product?.suggestedWeightKg;
  if (typeof weight !== "number") {
    return "";
  }
  if (product.loadSystem === "plate_loaded") {
    return `${weight} kg en discs`;
  }
  if (product.loadSystem === "stack") {
    return `${weight} kg stack`;
  }
  if (product.loadSystem === "free_weight") {
    return `${weight} kg lliure`;
  }
  return `${weight} kg`;
}

function formatLastWeight(productId) {
  const weight = state.usageStats.lastWeightByProduct[productId]?.weightKg;
  return typeof weight === "number" ? ` - Ultim pes ${weight} kg` : "";
}

function formatLastWeightCompact(productId) {
  const weight = state.usageStats.lastWeightByProduct[productId]?.weightKg;
  return typeof weight === "number" ? `Ultim ${weight} kg` : "";
}

function trimSentence(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}

function getRoutineDay(dayId) {
  return state.routineDays.find((day) => day.id === dayId) || null;
}

async function ensureActiveWorkoutSession() {
  const existing = getActiveSession();
  if (existing) {
    return existing;
  }

  resetSessionTimer();

  const session = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    objective: state.selectedObjective,
    entries: [],
    guidedPlan: null
  };

  await persistSession(session);
  state.activeSessionId = session.id;
  if (!state.sessionTimerId) {
    startSessionTimer();
  }
  return session;
}

async function startActiveWorkoutSession() {
  await ensureActiveWorkoutSession();
  renderAll();
}

async function finishActiveWorkoutSession() {
  const activeSession = getActiveSession();
  if (!activeSession) {
    return;
  }

  activeSession.endedAt = new Date().toISOString();
  await persistSession(activeSession);
  state.activeSessionId = null;
  resetSessionTimer();
  renderAll();
}

async function copyLatestSession() {
  const latestCompleted = state.sessions.find((session) => session.endedAt);
  if (!latestCompleted || state.activeSessionId) {
    return;
  }

  const copy = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    objective: latestCompleted.objective,
    copiedFromSessionId: latestCompleted.id,
    entries: latestCompleted.entries.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
      copied: true
    }))
  };

  await persistSession(copy);
  state.activeSessionId = copy.id;
  resetSessionTimer();
  startSessionTimer();
  renderAll();
}

async function handleTodayPlanStart() {
  const session = await ensureGuidedPlanSession();
  if (!session) {
    return;
  }

  renderAll();
}

async function handleTodayPlanRefresh() {
  const recommendationPool = getRecommendationPool();
  const alternativePool = getAlternativePool();
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  if (routine.exercises.length === 0) {
    return;
  }

  const activeSession = getActiveSession();
  const nextPlan = buildGuidedPlan(routine, alternativePool, getGuidedPlanContext());
  enforceGuidedPlanUniqueness(nextPlan, alternativePool);
  if (activeSession?.guidedPlan?.steps?.some((step) => step.status === "done" || step.status === "skipped")) {
    renderAll();
    return;
  }

  if (activeSession) {
    activeSession.guidedPlan = nextPlan;
    setTodayPlanStage("current");
    await persistSession(activeSession);
  }
  renderAll();
}

async function handleTodayPlanLog() {
  let session = getActiveSession();
  if (!session?.guidedPlan?.steps?.length) {
    await handleTodayPlanStart();
    session = getActiveSession();
  }

  const currentStep = getCurrentGuidedStep(session?.guidedPlan);
  if (!currentStep) {
    return;
  }

  openLogForm({
    productId: currentStep.productId,
    exerciseId: currentStep.exerciseId || currentStep.productId,
    title: currentStep.title,
    muscleGroups: currentStep.muscleGroups,
    equipmentType: currentStep.equipmentType,
    sourceType: currentStep.sourceType || "guided-plan",
    defaultSets: currentStep.setsTarget || "",
    defaultReps: currentStep.repsTarget || currentStep.prescription || "",
    defaultNotes: currentStep.swapCount > 0 && currentStep.alternativeOf ? `Alternativa de ${currentStep.alternativeOf}` : "",
    defaultWeightKg: typeof currentStep.suggestedWeightKg === "number" ? currentStep.suggestedWeightKg : null,
    guidedPlanStepId: currentStep.id
  });
}

async function handleTodayPlanStageClick(event) {
  const button = event.target.closest("[data-today-stage]");
  if (!button) {
    return;
  }
  setTodayPlanStage(button.dataset.todayStage);
  renderAll();
}

async function handleTodayPlanOccupied() {
  const activeSession = await ensureGuidedPlanSession();
  const plan = activeSession?.guidedPlan;
  let currentStep = getCurrentGuidedStep(plan);
  if (!activeSession || !plan || !currentStep) {
    return;
  }

  if (!currentStep.alternativeOptions?.length) {
    enforceGuidedPlanUniqueness(plan, getAlternativePool(), currentStep.id);
    plan.updatedAt = new Date().toISOString();
    await persistSession(activeSession);
    currentStep = getCurrentGuidedStep(plan);
  }

  if (!currentStep?.alternativeOptions?.length) {
    await notifyUser("Sense recanvi directe", `No hem trobat una maquina semblant per a ${currentStep?.title || "aquest pas"}.`);
    return;
  }

  setTodayPlanStage("switch");
  renderAll();
  const firstAlternative = elements.todayPlanAlternatives?.querySelector("[data-alt-index]");
  if (firstAlternative) {
    firstAlternative.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    firstAlternative.focus();
    return;
  }
}

async function handleTodayPlanHide() {
  const activeSession = await ensureGuidedPlanSession();
  const plan = activeSession?.guidedPlan;
  const currentStep = getCurrentGuidedStep(plan);
  if (!activeSession || !plan || !currentStep || !supportsAvailabilityToggle(currentStep)) {
    return;
  }

  await setMachineAvailability(currentStep.productId, false);
  const replacementState = reconfigureGuidedPlanAfterPermanentHide(plan, currentStep.productId, getAlternativePool());
  plan.updatedAt = new Date().toISOString();
  setTodayPlanStage("current");
  await persistSession(activeSession);

  const summary = replacementState.replaced > 0
    ? `${replacementState.replaced} pas${replacementState.replaced > 1 ? "s" : ""} reconfigurat${replacementState.replaced > 1 ? "s" : ""}.`
    : replacementState.skipped > 0
      ? `${replacementState.skipped} pas${replacementState.skipped > 1 ? "s" : ""} sense recanvi directe.`
      : "Ja no la tornarem a proposar.";
  await notifyUser("Maquina retirada del teu gimnas", summary);
  renderAll();
}

async function handleTodayPlanAlternativeRailClick(event) {
  const button = event.target.closest("[data-alt-index]");
  if (!button) {
    return;
  }

  const activeSession = await ensureGuidedPlanSession();
  const plan = activeSession?.guidedPlan;
  const currentStep = getCurrentGuidedStep(plan);
  if (!activeSession || !plan || !currentStep) {
    return;
  }

  const alternativeIndex = Number(button.dataset.altIndex || 0);
  await applyGuidedAlternativeSwap(activeSession, currentStep, alternativeIndex);
}

async function handleGuidedCardAlternativeRailClick(event) {
  const button = event.target.closest("[data-guided-step-position][data-guided-alt-index]");
  if (!button) {
    return;
  }

  const activeSession = await ensureGuidedPlanSession();
  const plan = activeSession?.guidedPlan;
  if (!activeSession || !plan) {
    return;
  }

  const stepPosition = Number(button.dataset.guidedStepPosition || 0);
  const alternativeIndex = Number(button.dataset.guidedAltIndex || 0);
  const targetStep = plan.steps.find((entry) => entry.position === stepPosition);
  if (!targetStep) {
    return;
  }

  await applyGuidedAlternativeSwap(activeSession, targetStep, alternativeIndex);
}

async function ensureGuidedPlanSession() {
  let session = getActiveSession();
  if (session?.guidedPlan?.steps?.length && getCurrentGuidedStep(session.guidedPlan)) {
    enforceGuidedPlanUniqueness(session.guidedPlan, getAlternativePool());
    return session;
  }

  const recommendationPool = getRecommendationPool();
  const alternativePool = getAlternativePool();
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  if (routine.exercises.length === 0) {
    return null;
  }

  session = await ensureActiveWorkoutSession();
  session.guidedPlan = buildGuidedPlan(routine, alternativePool, getGuidedPlanContext());
  enforceGuidedPlanUniqueness(session.guidedPlan, alternativePool);
  session.guidedPlan.startedAt = new Date().toISOString();
  setTodayPlanStage("current");
  await persistSession(session);
  return session;
}

async function applyGuidedAlternativeSwap(activeSession, currentStep, alternativeIndex) {
  const nextAlternative = currentStep.alternativeOptions?.splice(alternativeIndex, 1)[0];
  if (!nextAlternative) {
    return;
  }

  const previousStepSnapshot = {
    ...currentStep,
    collections: [...(currentStep.collections || [])],
    collectionHandles: [...(currentStep.collectionHandles || [])],
    muscleGroups: [...(currentStep.muscleGroups || [])],
    imageUrls: [...(currentStep.imageUrls || [])],
    equipment: [...(currentStep.equipment || [])],
    progressions: [...(currentStep.progressions || [])],
    regressions: [...(currentStep.regressions || [])],
    safetyNotes: [...(currentStep.safetyNotes || [])]
  };
  const preservedId = currentStep.id;
  const previousTitle = currentStep.title;
  const remainingOptions = [...(currentStep.alternativeOptions || [])];
  copyGuidedStepFields(currentStep, nextAlternative);
  currentStep.id = preservedId;
  currentStep.status = "pending";
  currentStep.completedAt = null;
  currentStep.skippedAt = null;
  currentStep.skipReason = null;
  currentStep.alternativeOf = currentStep.alternativeOf || previousTitle;
  currentStep.swapCount = (currentStep.swapCount || 0) + 1;
  const fallbackOption = {
    ...previousStepSnapshot,
    id: previousStepSnapshot.productId || previousStepSnapshot.id || crypto.randomUUID(),
    alternativeOptions: []
  };
  currentStep.alternativeOptions = dedupeAlternativeOptions([...remainingOptions, fallbackOption], currentStep.title);
  const plan = activeSession.guidedPlan;
  enforceGuidedPlanUniqueness(plan, getAlternativePool(), currentStep.id);
  plan.updatedAt = new Date().toISOString();
  setTodayPlanStage("current");
  await persistSession(activeSession);
  await notifyUser("Alternativa carregada", `Canvia a ${currentStep.title}.`);
  renderAll();
}

async function handleTodayPlanSkip() {
  const activeSession = getActiveSession();
  const plan = activeSession?.guidedPlan;
  const currentStep = getCurrentGuidedStep(plan);
  if (!activeSession || !plan || !currentStep) {
    return;
  }

  currentStep.status = "skipped";
  currentStep.skippedAt = new Date().toISOString();
  currentStep.skipReason = "manual-skip";
  plan.updatedAt = new Date().toISOString();
  setTodayPlanStage("current");
  await persistSession(activeSession);
  const nextStep = getCurrentGuidedStep(plan);
  if (nextStep) {
    await notifyUser("Pas saltat", `Seguent: ${nextStep.title}.`);
  } else {
    await notifyUser("Sessio completada", "No queden mes passos pendents avui.");
  }
  renderAll();
}

async function completeGuidedPlanStep(stepId, details) {
  const activeSession = getActiveSession();
  const plan = activeSession?.guidedPlan;
  if (!activeSession || !plan) {
    return;
  }

  const step = plan.steps.find((entry) => entry.id === stepId);
  if (!step || step.status === "done") {
    return;
  }

  step.status = "done";
  step.completedAt = new Date().toISOString();
  step.loggedSets = details.sets;
  step.loggedReps = details.reps;
  step.loggedWeightKg = details.weightKg;
  plan.updatedAt = new Date().toISOString();
  setTodayPlanStage("current");
  const nextStep = getCurrentGuidedStep(plan);
  if (!nextStep) {
    plan.finishedAt = new Date().toISOString();
  }
  await persistSession(activeSession);
  if (!nextStep) {
    await notifyUser("Sessio completada", "Has tancat tots els passos del dia.");
    return;
  }

  const transitionSeconds = nextStep.transitionSeconds || 0;
  const countdownSeconds = transitionSeconds > 0 ? transitionSeconds : step.restSeconds;
  await notifyUser("Seguent pas", countdownSeconds > 0
    ? `${nextStep.title} en ${formatCountdownLabel(countdownSeconds)}.`
    : `Ves a ${nextStep.title}.`);
  if (countdownSeconds > 0) {
    startRestTimer(countdownSeconds, {
      title: "Canvi completat",
      body: `Ves a ${nextStep.title}.`
    });
  }
}

async function persistSession(session) {
  await writeSession(session);
  syncSessionInState(session);
}

function syncSessionInState(session) {
  const index = state.sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    state.sessions[index] = session;
  } else {
    state.sessions.unshift(session);
  }
  state.sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

async function persistRoutineDay(day) {
  await writeRoutineDay(day);
  const index = state.routineDays.findIndex((item) => item.id === day.id);
  if (index >= 0) {
    state.routineDays[index] = day;
  } else {
    state.routineDays.push(day);
  }
  state.routineDays = sortRoutineDays(state.routineDays);
}

function computeWeeklyChecklist() {
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const counts = Object.fromEntries(CHECKLIST_MUSCLE_GROUPS.map((muscleId) => [muscleId, new Set()]));
  let eventCount = 0;

  state.usageEvents.forEach((event) => {
    const eventDate = new Date(event.createdAt);
    if (eventDate < start || eventDate >= end) {
      return;
    }
    eventCount += 1;
    (event.muscleGroups || []).forEach((muscle) => {
      if (counts[muscle] !== undefined) {
        counts[muscle].add(event.dateKey);
      }
    });
  });

  const items = CHECKLIST_MUSCLE_GROUPS.map((muscleId) => {
    const count = counts[muscleId]?.size || 0;
    return {
      muscleId,
      count,
      status: count === 0 ? "red" : count === 1 ? "yellow" : "green"
    };
  });

  const redGroups = items.filter((item) => item.status === "red");
  const sorted = [...items].sort((left, right) => right.count - left.count);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const insights = [];

  if (redGroups.length > 0) {
    insights.push(`Sense treball aquesta setmana: ${redGroups.map((item) => labelForMuscle(item.muscleId).toLowerCase()).join(", ")}.`);
  }
  if (top && bottom && top.count >= bottom.count + 2) {
    insights.push(`Descompensacio detectada: mes ${labelForMuscle(top.muscleId).toLowerCase()} que ${labelForMuscle(bottom.muscleId).toLowerCase()}.`);
  }
  if (redGroups.length <= 2) {
    insights.push("La setmana encara compleix la regla antipifia, pero cal vigilar els grups menys treballats.");
  }

  return { items, redGroups, insights, eventCount };
}

function computePersonalRecords() {
  const byProduct = new Map();

  state.usageEvents.forEach((event) => {
    if (typeof event.weightKg !== "number" || event.weightKg <= 0) {
      return;
    }
    const current = byProduct.get(event.productId);
    const repsValue = event.reps || "";
    if (!current || event.weightKg > current.bestWeightKg) {
      byProduct.set(event.productId, {
        title: event.productTitle,
        bestWeightKg: event.weightKg,
        bestReps: repsValue
      });
    }
  });

  return Array.from(byProduct.values()).sort((left, right) => right.bestWeightKg - left.bestWeightKg);
}

function formatSessionEntry(entry) {
  const pieces = [];
  if (entry.sets) {
    pieces.push(`${entry.sets} series`);
  }
  if (entry.reps) {
    pieces.push(`${entry.reps} rep/temps`);
  }
  if (typeof entry.weightKg === "number") {
    pieces.push(`${entry.weightKg} kg`);
  }
  if (entry.notes) {
    pieces.push(entry.notes);
  }
  return pieces.join(" - ");
}

function formatRoutineEntry(entry) {
  const muscles = (entry.muscleGroups || [])
    .filter((muscle) => muscle !== "all")
    .map((muscle) => labelForMuscle(muscle))
    .join(", ");
  const parts = [];
  if (muscles) {
    parts.push(muscles);
  }
  if (entry.sets) {
    parts.push(`${entry.sets} series`);
  }
  if (entry.reps) {
    parts.push(`${entry.reps} rep`);
  }
  if (typeof entry.weightKg === "number") {
    parts.push(`${entry.weightKg} kg`);
  }
  return parts.join(" - ");
}

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWeightSelectOptions() {
  const weights = [
    0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30,
    35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120
  ];
  return [
    { value: "", label: "Sense dada" },
    ...weights.map((weight) => ({
      value: formatWeightOptionValue(weight),
      label: weight === 0 ? "0 kg (sense pes extern)" : `${formatWeightOptionValue(weight)} kg`
    }))
  ];
}

function formatWeightOptionValue(weight) {
  return Number.isInteger(weight) ? String(weight) : String(weight).replace(/\.0$/, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatMinutes(minutes) {
  return `${String(minutes).replace(".0", "")} min`;
}

function formatTransition(seconds) {
  if (!seconds) {
    return "sense transicio";
  }
  if (seconds >= 60) {
    return `${round(seconds / 60, 1)} min de canvi`;
  }
  return `${seconds} s de canvi`;
}

function formatCountdownLabel(seconds) {
  if (seconds >= 60) {
    return `${round(seconds / 60, 1)} min`;
  }
  return `${seconds} s`;
}

function renderBalanceMap() {
  if (!elements.bodyMapHost.firstElementChild) {
    return;
  }

  const allRegion = elements.bodyMapHost.querySelector("[data-region='all']");
  const parts = elements.bodyMapHost.querySelectorAll("[data-region]");
  const scores = state.usageStats.balanceScoreByMuscle;
  const meta = state.usageStats.proportionalityMeta || { hasEnoughData: false, confidence: "low", scoredMuscles: 0, entryCount: 0 };
  let available = 0;

  parts.forEach((part) => {
    const muscle = part.dataset.region;
    if (muscle === "all") {
      return;
    }
    const score = scores[muscle];
    const shapes = part.querySelectorAll(".region");
    if (typeof score !== "number") {
      shapes.forEach((shape) => {
        shape.style.fillOpacity = "0";
      });
      return;
    }
    available += 1;
    shapes.forEach((shape) => {
      shape.style.fill = colorForScore(score);
      shape.style.fillOpacity = String(0.62 + score * 0.24);
    });
  });

  if (allRegion) {
    allRegion.style.opacity = available > 0 ? "0.42" : "0.28";
  }

  const ranked = Object.entries(scores)
    .sort((left, right) => left[1] - right[1])
    .map(([muscle, score]) => `${labelForMuscle(muscle)} ${Math.round(score * 100)}%`);

  elements.balanceLegend.innerHTML = ranked.length > 0
    ? [`Fiabilitat ${labelForConfidence(meta.confidence)}`, ...ranked].map((entry) => `<span class="tag">${entry}</span>`).join("")
    : `<span class="tag">Sense prou dades encara</span>`;

  if (available === 0) {
    elements.balanceSummary.textContent = "Registra pes en diverses zones per omplir el mapa.";
    return;
  }

  elements.balanceSummary.textContent = meta.hasEnoughData
    ? `Mapa ajustat amb factors relatius. Verd fort; vermell endarrerit.`
    : `Lectura preliminar amb factors relatius. Cal mes historic.`;
}

function colorForScore(score) {
  const bounded = Math.min(1, Math.max(0, score));
  if (bounded <= 0.5) {
    return mixColor([142, 53, 40], [184, 155, 114], bounded / 0.5);
  }
  return mixColor([184, 155, 114], [76, 102, 84], (bounded - 0.5) / 0.5);
}

function mixColor(start, end, ratio) {
  const channel = start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
  return `rgb(${channel[0]} ${channel[1]} ${channel[2]})`;
}

function labelForConfidence(confidence) {
  if (confidence === "high") {
    return "alta";
  }
  if (confidence === "medium") {
    return "mitjana";
  }
  return "baixa";
}

function labelForObjective(objective) {
  if (objective === "strength") {
    return "forca";
  }
  if (objective === "toning") {
    return "tonificacio";
  }
  if (objective === "fat-loss") {
    return "perdua de greix";
  }
  if (objective === "endurance") {
    return "resistencia";
  }
  if (objective === "mobility") {
    return "mobilitat";
  }
  if (objective === "quick") {
    return "rutina rapida";
  }
  if (objective === "recovery") {
    return "tecnica";
  }
  return "hipertrofia";
}

function bodyweightPrescription() {
  if (state.selectedObjective === "strength") {
    return "4-5 series x 5-8 rep o 20-30s";
  }
  if (state.selectedObjective === "toning") {
    return "3-4 series x 10-15 rep o 25-40s";
  }
  if (state.selectedObjective === "fat-loss") {
    return "3-5 rondes x 12-20 rep o 30-45s";
  }
  if (state.selectedObjective === "endurance") {
    return "2-4 rondes x 15-25 rep o 30-45s";
  }
  if (state.selectedObjective === "mobility") {
    return "2-3 series suaus x 6-10 rep o 20-40s";
  }
  if (state.selectedObjective === "recovery") {
    return "2-3 series suaus x 8-12 rep o 20-30s";
  }
  if (state.selectedObjective === "quick") {
    return "2-3 rondes x 8-12 rep o 20-30s";
  }
  return "3-4 series x 8-15 rep o 20-40s";
}

function formatBodyweightDescription(exercise) {
  const prescription = exercise.repsOrDuration || bodyweightPrescription();
  const safety = exercise.safetyNotes?.[0] || "Prioritza tecnica.";
  return `${exercise.description} - ${exercise.sets || "3"} series - ${prescription} - ${safety}`;
}

function labelForMovementPattern(pattern) {
  if (!pattern) {
    return "Sense patro";
  }
  const labels = {
    push_horitzontal: "Push horitzontal",
    push_vertical: "Push vertical",
    pull_horitzontal: "Pull horitzontal",
    pull_vertical: "Pull vertical",
    squat: "Squat",
    squat_unilateral: "Squat unilateral",
    hinge: "Hinge",
    anti_extension: "Core anti-extensio",
    anti_rotation: "Core anti-rotacio",
    cardio_core: "Cardio + core",
    cardio_full_body: "Cardio total",
    posterior_chain_lumbar: "Cadena posterior",
    elbow_extension: "Extensio de colze",
    elbow_flexion: "Flexio de colze",
    plantar_flexio: "Bessons",
    locomocio_cardio: "Locomocio / cardio"
  };
  return labels[pattern] || titleCase(pattern.replaceAll("_", " "));
}

function labelForEquipmentSummary(equipment) {
  if (!equipment || equipment.length === 0) {
    return "Pes corporal";
  }
  return equipment
    .slice(0, 2)
    .map((item) => titleCase(item.replaceAll("_", " ")))
    .join(" + ");
}

function labelForReplacement(replacement) {
  if (!replacement) {
    return "Sense maquina";
  }
  return titleCase(replacement.replaceAll("_", " "));
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paintNotificationSupport() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!("Notification" in window)) {
    elements.notificationStatus.textContent = "Sense Notifications API. Farem servir avisos dins l'app.";
    return;
  }

  if (!standalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    elements.notificationStatus.textContent = "A iOS, les notificacions completes demanen l'app instal.lada.";
    return;
  }

  if (/Android/i.test(navigator.userAgent)) {
    elements.notificationStatus.textContent = `Android. Estat dels avisos: ${Notification.permission}.`;
    return;
  }

  elements.notificationStatus.textContent = `Estat dels avisos: ${Notification.permission}.`;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    paintNotificationSupport();
    return;
  }
  const permission = await Notification.requestPermission();
  elements.notificationStatus.textContent = `Estat dels avisos: ${permission}.`;
}

function startSessionTimer() {
  if (state.sessionTimerId) {
    return;
  }
  state.sessionStartedAt = Date.now() - state.sessionElapsedMs;
  state.sessionTimerId = window.setInterval(() => {
    state.sessionElapsedMs = Date.now() - state.sessionStartedAt;
    renderSessionClock();
  }, 1000);
  renderSessionClock();
}

function pauseSessionTimer() {
  if (!state.sessionTimerId) {
    return;
  }
  window.clearInterval(state.sessionTimerId);
  state.sessionTimerId = null;
}

function resetSessionTimer() {
  pauseSessionTimer();
  state.sessionElapsedMs = 0;
  state.sessionStartedAt = null;
  renderSessionClock();
}

function renderSessionClock() {
  elements.sessionClock.textContent = formatDuration(state.sessionElapsedMs, true);
}

function startRestTimer(seconds, completionNotice = null) {
  stopRestTimer();
  state.restEndsAt = Date.now() + seconds * 1000;
  renderRestClock(seconds * 1000);
  state.restTimerId = window.setInterval(() => {
    const remaining = Math.max(0, state.restEndsAt - Date.now());
    renderRestClock(remaining);
    if (remaining <= 0) {
      stopRestTimer();
      const notice = completionNotice || { title: "Descans acabat", body: "Torna a la seguent serie quan vulguis." };
      notifyUser(notice.title, notice.body);
    }
  }, 250);
}

function stopRestTimer() {
  if (state.restTimerId) {
    window.clearInterval(state.restTimerId);
    state.restTimerId = null;
  }
  state.restEndsAt = null;
  renderRestClock(0);
}

function renderRestClock(ms) {
  elements.restClock.textContent = formatDuration(ms, false);
}

async function notifyUser(title, body) {
  beep();
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification(title, { body, tag: "gymbros-timer" });
        return;
      }
      new Notification(title, { body });
      return;
    } catch (error) {
      console.error(error);
    }
  }
  elements.notificationStatus.textContent = `${title}: ${body}`;
}

function beep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  } catch (error) {
    console.error(error);
  }
}

async function toggleWakeLock() {
  if (!("wakeLock" in navigator)) {
    elements.notificationStatus.textContent = "Aquest navegador no suporta Wake Lock.";
    return;
  }

  if (state.wakeLock) {
    await state.wakeLock.release();
    state.wakeLock = null;
    elements.wakeLockToggle.textContent = "Mante pantalla";
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    elements.wakeLockToggle.textContent = "Pantalla activa";
  } catch (error) {
    console.error(error);
    elements.notificationStatus.textContent = "No s'ha pogut mantenir la pantalla activa.";
  }
}

async function handleVisibilityChange() {
  if (document.visibilityState === "visible" && state.wakeLock && "wakeLock" in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      elements.wakeLockToggle.textContent = "Pantalla activa";
    } catch (error) {
      console.error(error);
    }
  }
}

function formatDuration(ms, includeHours) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (includeHours) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortRoutineDays(days) {
  const order = new Map(ROUTINE_DAY_OPTIONS.map((option, index) => [option.id, index]));
  return [...days].sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
}

async function loadBodyMap() {
  try {
    const response = await fetch("assets/graphics/body-map.svg");
    if (!response.ok) {
      throw new Error("No s'ha pogut carregar el body map.");
    }
    const markup = await response.text();
    state.bodyMapMarkup = markup;
    elements.bodyMapHost.innerHTML = markup;
    const svg = elements.bodyMapHost.querySelector("svg");
    if (svg) {
      svg.classList.add("body-map");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("focusable", "false");
      svg.style.background = "transparent";
      const baseImage = svg.querySelector("#base_png");
      if (baseImage) {
        baseImage.classList.add("body-map__base");
      }
    }
  } catch (error) {
    console.error(error);
    elements.balanceSummary.textContent = "No s'ha pogut carregar el mapa corporal.";
  }
}

