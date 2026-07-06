import { APP_NAME, CATALOG_PROVIDERS, CHECKLIST_MUSCLE_GROUPS, DURATION_OPTIONS, IMAGE_CACHE, MUSCLE_GROUPS, OBJECTIVE_OPTIONS, ROUTINE_DAY_OPTIONS, SYNC_VERSION } from "./config.js";
import { BODYWEIGHT_EXERCISES } from "./bodyweight-library.js";
import { fetchCatalogWithProgress, fetchProductInstructionSheet } from "./catalog.js";
import { buildLoggableExerciseContexts, normalizeLookupText, resolveLogContextFromInput } from "./logging-catalog.js";
import { buildProgressionProfile } from "./proportionality.js";
import { buildCalendarDays, buildRoutine, compareProducts, createUsageStats, decorateRecommendations, filterProducts, getHiddenProducts, getVisibleProducts } from "./recommendations.js";
import { runClientMigrations } from "./migrations.js";
import { deleteSessionCascade, readCustomExercises, readMachinePrefs, readMeta, readProducts, readRoutineDays, readSessions, readUsageEvents, replaceSessionUsageEvents, writeCustomExercise, writeMachinePref, writeMeta, writeProducts, writeRoutineDay, writeSession, writeUsageEvent, writeUsageEventAndSession } from "./storage.js";

const state = {
  products: [],
  decoratedProducts: [],
  filteredProducts: [],
  decoratedBodyweight: [],
  selectedMuscle: "all",
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
  editingCompletedSessionDraft: null
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
  { value: "", label: "Series" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" }
];

const REP_SELECT_OPTIONS = [
  { value: "", label: "Reps / temps" },
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
  todayPlanAlternatives: document.querySelector("#today-plan-alternatives"),
  todayPlanStart: document.querySelector("#today-plan-start"),
  todayPlanLog: document.querySelector("#today-plan-log"),
  todayPlanAlternative: document.querySelector("#today-plan-alternative"),
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
  bodyweightSummary: document.querySelector("#bodyweight-summary"),
  bodyweightGrid: document.querySelector("#bodyweight-grid"),
  weeklyStatus: document.querySelector("#weekly-status"),
  weeklyAlert: document.querySelector("#weekly-alert"),
  weeklyMuscleGrid: document.querySelector("#weekly-muscle-grid"),
  weeklyInsights: document.querySelector("#weekly-insights"),
  plannerStatus: document.querySelector("#planner-status"),
  routineDayGrid: document.querySelector("#routine-day-grid"),
  exerciseForm: document.querySelector("#exercise-form"),
  exerciseDay: document.querySelector("#exercise-day"),
  exerciseGymArea: document.querySelector("#exercise-gym-area"),
  exercisePrimaryMuscle: document.querySelector("#exercise-primary-muscle"),
  exerciseSecondaryMuscles: document.querySelector("#exercise-secondary-muscles"),
  exerciseSets: document.querySelector("#exercise-sets"),
  exerciseReps: document.querySelector("#exercise-reps"),
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
  logForm: document.querySelector("#log-form"),
  logFormExercise: document.querySelector("#log-form-exercise"),
  logFormSets: document.querySelector("#log-form-sets"),
  logFormReps: document.querySelector("#log-form-reps"),
  logFormWeight: document.querySelector("#log-form-weight"),
  logFormNotes: document.querySelector("#log-form-notes"),
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
  clearLogForm();

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
    setProgress(0, "Pots entrenar ara. Sincronitza si vols maquines reals.");
  }
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
  elements.completedSessionForm?.addEventListener("submit", handleCompletedSessionFormSubmit);
  elements.completedSessionForm?.addEventListener("input", handleCompletedSessionFormInput);
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
  elements.todayPlanAlternative?.addEventListener("click", handleTodayPlanAlternative);
  elements.todayPlanAlternatives?.addEventListener("click", handleTodayPlanAlternativeRailClick);
  elements.todayPlanSkip?.addEventListener("click", handleTodayPlanSkip);
  elements.todayPlanRefresh?.addEventListener("click", handleTodayPlanRefresh);
  elements.logForm.addEventListener("submit", handleLogFormSubmit);
  elements.logFormCancel.addEventListener("click", () => clearLogForm());
  elements.logFormExercise.addEventListener("change", handleLogExerciseInput);
  elements.logNextActions.addEventListener("click", handleLogNextActionsClick);
  elements.firstUseWizard?.addEventListener("click", handleFirstUseAction);
  elements.machineSheetModal?.addEventListener("click", handleMachineSheetClick);
  document.addEventListener("click", handleScrollTargetClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("gymbros:section-changed", handleSectionChanged);
  window.addEventListener("online", updateOfflineIndicator);
  window.addEventListener("offline", updateOfflineIndicator);
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
    button.className = `chip${muscle.id === state.selectedMuscle ? " is-active" : ""}`;
    button.textContent = muscle.label;
    button.addEventListener("click", () => {
      state.selectedMuscle = muscle.id;
      renderMuscleFilters();
      recomputeDerivedState();
      renderAll();
    });
    elements.muscleFilters.append(button);
  }
}

function populatePlannerSelects() {
  elements.exerciseDay.innerHTML = ROUTINE_DAY_OPTIONS
    .map((option) => `<option value="${option.id}">${option.label}</option>`)
    .join("");

  const muscleOptions = CHECKLIST_MUSCLE_GROUPS
    .map((muscleId) => `<option value="${muscleId}">${labelForMuscle(muscleId)}</option>`)
    .join("");

  elements.exercisePrimaryMuscle.innerHTML = muscleOptions;
  elements.exerciseSecondaryMuscles.innerHTML = muscleOptions;
  renderSelectOptions(elements.exerciseGymArea, GYM_AREA_OPTIONS);
  renderSelectOptions(elements.exerciseSets, SET_SELECT_OPTIONS);
  renderSelectOptions(elements.exerciseReps, REP_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormSets, SET_SELECT_OPTIONS);
  renderSelectOptions(elements.logFormReps, REP_SELECT_OPTIONS);
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
    ? "Ja tens cataleg local. Ves a propostes, sense maquines o maquines descartades."
    : "Entrena ara sense sincronitzar o afegeix el cataleg real del gimnas.";
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
    window.dispatchEvent(new CustomEvent("gymbros:navigate", { detail: { sectionId: "section-hidden" } }));
  }
}

function handleSectionChanged(event) {
  const sectionId = event.detail?.sectionId;
  if (sectionId === "section-log" && !state.pendingLogContext && !elements.logNextActions.hidden) {
    clearLogForm();
  }
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

async function toggleMachine(productId, makeVisible) {
  const payload = {
    id: productId,
    availability: makeVisible ? "active" : "hidden",
    updatedAt: new Date().toISOString()
  };
  await writeMachinePref(payload);
  state.machinePrefs[productId] = payload;
  recomputeDerivedState();
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
  renderRecommendations();
  renderWeeklyChecklist();
  renderRoutinePlanner();
  renderCatalog();
  renderBodyweight();
  renderHidden();
  renderActiveSession();
  renderPersonalRecords();
  renderHistory();
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
      const muscleMatch = state.selectedMuscle === "all"
        || exercise.muscleGroups.includes(state.selectedMuscle)
        || exercise.muscleGroups.includes("all");
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

function renderRecommendations() {
  const recommendationPool = getRecommendationPool();
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  const guidedPlan = getRenderableGuidedPlan(recommendationPool, routine);
  renderTodayPlan(guidedPlan, routine);
  elements.recommendations.innerHTML = "";

  if (guidedPlan?.steps?.length) {
    const currentStep = getCurrentGuidedStep(guidedPlan);
    guidedPlan.steps.forEach((step) => {
      elements.recommendations.append(buildGuidedPlanCard(step, currentStep?.id === step.id));
    });
  }

  if (recommendationPool.length === 0) {
    const machineOnly = state.selectedEquipmentType === "machine" || state.selectedEquipmentType === "free-weight" || state.selectedEquipmentType === "support";
    elements.summaryText.textContent = state.products.length === 0 && machineOnly
      ? "Sense cataleg local per a aquest filtre. Sincronitza o passa a sense maquines."
      : "Cap proposta per als filtres actuals.";
    return;
  }

  elements.summaryText.textContent = `${routine.duration.label} - ${routine.exercises.length} exercicis - ${routine.explanation}`;
}

function getRenderableGuidedPlan(recommendationPool, routine) {
  const activePlan = getActiveSession()?.guidedPlan;
  if (activePlan?.steps?.length) {
    return activePlan;
  }
  if (routine.exercises.length === 0) {
    return null;
  }
  return buildGuidedPlan(routine, recommendationPool);
}

function buildGuidedPlan(routine, recommendationPool) {
  if (!routine?.exercises?.length) {
    return null;
  }

  const selectedIds = new Set(routine.exercises.map((exercise) => exercise.id));
  const steps = [];

  routine.exercises.forEach((exercise, index) => {
    const previous = steps[steps.length - 1] || null;
    const step = buildGuidedPlanStep({
      exercise,
      index,
      total: routine.exercises.length,
      previousStep: previous,
      recommendationPool,
      selectedIds
    });
    steps.push(step);
  });

  scaleGuidedStepMinutes(steps, routine.duration.value);

  const totalTransitionSeconds = steps.reduce((sum, step) => sum + step.transitionSeconds, 0);
  const totalStationMinutes = steps.reduce((sum, step) => sum + step.stationMinutes, 0);

  return {
    id: `preview:${routine.duration.value}:${state.selectedObjective}:${state.selectedMuscle}:${state.selectedEquipmentType}:${state.selectedBrand}:${state.searchQuery}`,
    createdAt: new Date().toISOString(),
    objective: state.selectedObjective,
    durationMinutes: routine.duration.value,
    durationLabel: routine.duration.label,
    explanation: routine.explanation,
    totalSteps: steps.length,
    totalStationMinutes,
    totalTransitionSeconds,
    totalEstimatedMinutes: round((totalStationMinutes + totalTransitionSeconds / 60), 1),
    steps
  };
}

function buildGuidedPlanStep({ exercise, index, total, previousStep, recommendationPool, selectedIds }) {
  const payload = buildGuidedStepPayload(exercise, index, total, previousStep);
  const alternativeOptions = pickAlternativeExercises(exercise, recommendationPool, selectedIds)
    .slice(0, 3)
    .map((candidate) => buildGuidedStepPayload(candidate, index, total, previousStep, true));

  return {
    ...payload,
    id: crypto.randomUUID(),
    status: "pending",
    completedAt: null,
    skippedAt: null,
    skipReason: null,
    alternativeOf: null,
    swapCount: 0,
    alternativeOptions
  };
}

function buildGuidedStepPayload(exercise, index, total, previousStep, forAlternative = false) {
  const profile = buildProgressionProfile(exercise);
  const { setsTarget, repsTarget } = splitPrescription(exercise.prescription);
  const restSeconds = estimateRestSeconds(profile);
  const transitionSeconds = previousStep ? estimateTransitionSeconds(previousStep, exercise) : 0;
  const stationMinutes = estimateStationMinutes({ exercise, restSeconds, setsTarget, repsTarget, profile });

  return {
    ...exercise,
    id: forAlternative ? crypto.randomUUID() : exercise.id,
    productId: exercise.id,
    position: index + 1,
    totalSteps: total,
    setsTarget,
    repsTarget,
    restSeconds,
    transitionSeconds,
    stationMinutes,
    movementFamily: profile.family,
    loadSystem: profile.loadSystem
  };
}

function scaleGuidedStepMinutes(steps, targetMinutes) {
  if (!steps.length) {
    return;
  }

  const totalTransitionMinutes = steps.reduce((sum, step) => sum + step.transitionSeconds / 60, 0);
  const targetStationMinutes = Math.max(steps.length * 3, targetMinutes - totalTransitionMinutes);
  const currentStationMinutes = steps.reduce((sum, step) => sum + step.stationMinutes, 0) || steps.length * 4;
  const scale = targetStationMinutes / currentStationMinutes;

  steps.forEach((step) => {
    const scaled = clamp(round(step.stationMinutes * scale, 1), 3, 14);
    step.stationMinutes = scaled;
  });
}

function renderTodayPlan(guidedPlan, routine) {
  if (!elements.todayPlanSummary || !elements.todayPlanCurrent) {
    return;
  }

  const activeSession = getActiveSession();
  const activePlan = activeSession?.guidedPlan || null;
  const renderPlan = activePlan?.steps?.length ? activePlan : guidedPlan;
  const currentStep = getCurrentGuidedStep(renderPlan);
  const completedCount = renderPlan?.steps?.filter((step) => step.status === "done").length || 0;
  const skippedCount = renderPlan?.steps?.filter((step) => step.status === "skipped").length || 0;
  const hasStartedPlan = Boolean(activePlan?.steps?.length);

  if (!renderPlan) {
    elements.todayPlanSummary.textContent = "Ajusta el filtre i el temps per generar la sessio d'avui.";
    elements.todayPlanCurrent.innerHTML = `
      <strong>Cap sessio preparada</strong>
      <span>Quan hi hagi propostes, veuras l'ordre, el temps i les alternatives de cada pas.</span>
    `;
    elements.todayPlanStart.disabled = true;
    elements.todayPlanLog.disabled = true;
    elements.todayPlanAlternative.disabled = true;
    elements.todayPlanSkip.disabled = true;
    elements.todayPlanRefresh.disabled = true;
    renderTodayPlanAlternatives(null);
    return;
  }

  elements.todayPlanSummary.textContent = hasStartedPlan
    ? `${renderPlan.totalSteps} passos - ${renderPlan.totalEstimatedMinutes} min estimats - ${completedCount} fets${skippedCount ? ` - ${skippedCount} saltats` : ""}`
    : `${renderPlan.totalSteps} passos - ${renderPlan.totalEstimatedMinutes} min estimats - ${routine.explanation}`;

  elements.todayPlanStart.textContent = hasStartedPlan ? "Continua sessio guiada" : "Comenca sessio guiada";
  elements.todayPlanStart.disabled = false;
  elements.todayPlanLog.disabled = !currentStep;
  elements.todayPlanAlternative.disabled = !currentStep || (currentStep.alternativeOptions?.length || 0) === 0;
  elements.todayPlanAlternative.textContent = currentStep?.alternativeOptions?.length ? `${currentStep.alternativeOptions.length} alternatives` : "Maquina ocupada";
  elements.todayPlanSkip.disabled = !currentStep;
  elements.todayPlanRefresh.disabled = hasStartedPlan && completedCount > 0;

  if (!currentStep) {
    elements.todayPlanCurrent.innerHTML = `
      <strong>Sessio del dia completada</strong>
      <span>Has tancat tots els passos. Pots revisar l'historic o generar una sessio nova amb altres filtres.</span>
    `;
    renderTodayPlanAlternatives(null);
    return;
  }

  const nextAlternative = currentStep.alternativeOptions?.[0];
  const stationLabel = currentStep.equipmentType === "bodyweight" ? "a l'estacio" : "a la maquina";
  const pieces = [
    `<strong>Pas ${currentStep.position}/${currentStep.totalSteps}: ${escapeHtml(currentStep.title)}</strong>`,
    `<span>${escapeHtml(currentStep.prescription || "Sense rang calculat")} - ${formatMinutes(currentStep.stationMinutes)} ${stationLabel} - ${formatTransition(currentStep.transitionSeconds)}</span>`,
    typeof currentStep.suggestedWeightKg === "number" ? `<span>Pes suggerit: ${escapeHtml(formatSuggestedWeight(currentStep).replace(/^ - /, ""))}</span>` : "",
    nextAlternative ? `<span>Si esta ocupada: ${escapeHtml(nextAlternative.title)}.</span>` : `<span>Cap alternativa directa disponible: salta el pas si la maquina no esta lliure.</span>`
  ].filter(Boolean);
  elements.todayPlanCurrent.innerHTML = pieces.join("");
  renderTodayPlanAlternatives(currentStep);
}

function renderTodayPlanAlternatives(currentStep) {
  if (!elements.todayPlanAlternatives) {
    return;
  }

  const alternatives = currentStep?.alternativeOptions || [];
  elements.todayPlanAlternatives.hidden = alternatives.length === 0;
  if (alternatives.length === 0) {
    elements.todayPlanAlternatives.innerHTML = "";
    return;
  }

  elements.todayPlanAlternatives.innerHTML = alternatives
    .map((option, index) => `
      <button class="alt-swap-card" type="button" data-alt-index="${index}">
        <strong>${escapeHtml(option.title)}</strong>
        <span>${escapeHtml(buildMachineActionSummary(option, pickPrimaryMuscle(option.muscleGroups)))}</span>
        <span>${escapeHtml(option.prescription || formatSuggestedWeightCompact(option) || "Canvia aquesta maquina")}</span>
      </button>
    `)
    .join("");
}

function buildGuidedPlanCard(step, isCurrent) {
  const fragment = buildCard(step, { hiddenMode: false, showPrescription: true, readOnly: true });
  const card = fragment.querySelector(".machine-card");
  const body = fragment.querySelector(".machine-card__body");
  const metaRow = document.createElement("div");
  metaRow.className = "tag-row";
  metaRow.innerHTML = [
    `<span class="tag">Pas ${step.position}/${step.totalSteps}</span>`,
    `<span class="tag">${formatMinutes(step.stationMinutes)} maquina</span>`,
    `<span class="tag">${formatTransition(step.transitionSeconds)}</span>`,
    step.status === "done"
      ? `<span class="tag">Fet</span>`
      : step.status === "skipped"
        ? `<span class="tag">Saltat</span>`
        : `<span class="tag">${step.alternativeOptions?.length || 0} alternatives</span>`
  ].join("");
  body.insertBefore(metaRow, body.querySelector(".machine-card__description"));
  card.classList.add("machine-card--guided");
  if (isCurrent) {
    card.classList.add("machine-card--current");
  }
  if (step.status === "done") {
    card.classList.add("machine-card--done");
  }
  if (step.status === "skipped") {
    card.classList.add("machine-card--skipped");
  }
  return fragment;
}

function pickAlternativeExercises(exercise, recommendationPool, selectedIds) {
  const sourceMuscles = new Set(exercise.muscleGroups || []);
  return recommendationPool
    .filter((candidate) => candidate.id !== exercise.id && !selectedIds.has(candidate.id))
    .map((candidate) => ({
      candidate,
      score: overlapScore(sourceMuscles, candidate)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.candidate.recommendationScore - left.candidate.recommendationScore)
    .map((entry) => entry.candidate);
}

function overlapScore(sourceMuscles, candidate) {
  const candidateMuscles = candidate.muscleGroups || [];
  const overlap = candidateMuscles.filter((muscle) => sourceMuscles.has(muscle)).length;
  const equipmentBonus = candidate.equipmentType === "bodyweight" ? 0 : 1;
  return overlap * 4 + equipmentBonus;
}

function renderCatalog() {
  elements.catalogGrid.innerHTML = "";
  elements.catalogCount.textContent = `${state.filteredProducts.length} fitxes`;
  elements.emptyState.hidden = state.filteredProducts.length > 0;
  elements.catalogEmptyActions.hidden = state.filteredProducts.length > 0;

  if (state.filteredProducts.length === 0) {
    const hasCatalog = state.products.length > 0;
    const hasActiveFilters = state.selectedMuscle !== "all"
      || state.selectedEquipmentType !== "all"
      || state.selectedSort !== "recommended"
      || state.selectedBrand !== "all"
      || Boolean(state.searchQuery);

    elements.emptyState.textContent = !hasCatalog
      ? "Encara no hi ha cataleg local. Pots sincronitzar-lo o entrenar sense maquines."
      : hasActiveFilters
        ? "No hi ha resultats per als filtres actuals. Prova una combinacio mes oberta o treballa sense maquines."
        : "No hi ha fitxes disponibles ara mateix.";
  }

  for (const product of state.filteredProducts) {
    elements.catalogGrid.append(buildCard(product, { hiddenMode: false, showPrescription: false }));
  }
}

function renderBodyweight() {
  const visible = getFilteredBodyweightExercises();

  elements.bodyweightGrid.innerHTML = "";
  if (state.selectedEquipmentType !== "all" && state.selectedEquipmentType !== "bodyweight") {
    elements.bodyweightSummary.textContent = "Filtre actual fora d'aquesta seccio.";
    return;
  }

  elements.bodyweightSummary.textContent = state.usageEvents.length === 0
    ? `${visible.length} exercicis disponibles. Via rapida per al primer entrenament.`
    : `${visible.length} exercicis sense maquines disponibles.`;

  for (const exercise of visible) {
    elements.bodyweightGrid.append(buildCard(exercise, { hiddenMode: false, showPrescription: false, allowToggle: false }));
  }
}

function renderHidden() {
  const hiddenProducts = getHiddenProducts(state.decoratedProducts, state.machinePrefs);
  elements.hiddenGrid.innerHTML = "";
  elements.hiddenCount.textContent = `${hiddenProducts.length} descartades`;
  elements.hiddenEmptyState.hidden = hiddenProducts.length > 0;

  for (const product of hiddenProducts) {
    elements.hiddenGrid.append(buildCard(product, { hiddenMode: true, showPrescription: false }));
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
    alert.textContent = "Setmana encara sense dades";
    elements.weeklyAlert.append(alert);
    elements.weeklyStatus.textContent = "Registra el primer entrenament per activar la checklist.";

    for (const item of weekly.items) {
      const card = document.createElement("div");
      card.className = "weekly-muscle-card";
      card.innerHTML = `
        <strong>${escapeHtml(labelForMuscle(item.muscleId))}</strong>
        <span class="weekly-muscle-card__count">Sense registres encara</span>
      `;
      elements.weeklyMuscleGrid.append(card);
    }

    ["Objectiu: no acabar la setmana amb mes de 2 grups en vermell."].forEach((text) => {
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
    ? `Falten massa zones sense treballar aquesta setmana. El limit es 2 grups en vermell.`
    : `Cobertura setmanal acceptable segons la regla antipifia.`;

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

function renderRoutinePlanner() {
  elements.routineDayGrid.innerHTML = "";
  const totalEntries = state.routineDays.reduce((sum, day) => sum + day.entries.length, 0);
  const plannedCoverage = computePlannedCoverage();
  elements.plannerStatus.textContent = totalEntries === 0
    ? "Encara no hi ha exercicis planificats."
    : plannedCoverage.redGroups.length > 2
      ? `${state.routineDays.length} dies configurats - ${totalEntries} exercicis planificats - pla antipifia invalid (${plannedCoverage.redGroups.length} grups sense cobrir).`
      : `${state.routineDays.length} dies configurats - ${totalEntries} exercicis planificats - cobertura planificada acceptable.`;

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
    elements.sessionStatus.textContent = "Encara no hi ha cap sessio activa.";
    elements.activeSessionSummary.textContent = "Agrupa exercicis, series, reps i pes dins la mateixa sessio.";
    const empty = document.createElement("div");
    empty.className = "session-item";
    empty.innerHTML = `
      <strong>Cap registre en curs</strong>
      <span class="session-item__meta">Inicia una sessio o registra un exercici solt.</span>
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
      <strong>Sense sessions tancades encara</strong>
      <span class="session-item__meta">La primera sessio tancada apareixera aqui.</span>
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

  draft.entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "session-item session-item--editable";
    item.innerHTML = `
      <div class="planner-form__row">
        <label class="toolbar__field">
          <span>Exercici</span>
          <input type="text" data-entry-id="${entry.id}" data-field="title" value="${escapeHtml(entry.title || "")}">
        </label>
        <label class="toolbar__field">
          <span>Series</span>
          <input type="text" data-entry-id="${entry.id}" data-field="sets" value="${escapeHtml(entry.sets || "")}">
        </label>
        <label class="toolbar__field">
          <span>Reps / temps</span>
          <input type="text" data-entry-id="${entry.id}" data-field="reps" value="${escapeHtml(entry.reps || "")}">
        </label>
      </div>
      <div class="planner-form__row">
        <label class="toolbar__field">
          <span>Pes kg</span>
          <input type="number" step="0.5" min="0" data-entry-id="${entry.id}" data-field="weightKg" value="${entry.weightKg ?? ""}">
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
        <textarea rows="2" data-entry-id="${entry.id}" data-field="notes">${escapeHtml(entry.notes || "")}</textarea>
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
    empty.textContent = "Encara no hi ha PRs basics disponibles.";
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
  const name = String(formData.get("name") || "").trim();
  const primaryMuscle = String(formData.get("primaryMuscle") || "").trim();
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
    gymArea: String(formData.get("gymArea") || "").trim(),
    primaryMuscle,
    secondaryMuscles: selectedSecondary,
    sets: String(formData.get("sets") || "").trim(),
    reps: String(formData.get("reps") || "").trim(),
    weightKg: parseOptionalNumber(formData.get("weightKg")),
    notes: String(formData.get("notes") || "").trim(),
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
  elements.exerciseDay.value = dayId;
  elements.exercisePrimaryMuscle.value = primaryMuscle;
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
    elements.logFormStatus.textContent = "Selecciona un exercici conegut per registrar-lo.";
    return;
  }

  const context = resolveLogContextFromInput(getLoggableExerciseContexts(), rawValue);
  if (!context) {
    state.pendingLogContext = null;
    elements.logFormSubmit.disabled = true;
    elements.logFormStatus.textContent = "Exercici no reconegut. Obre'l des d'una fitxa o selecciona'n un de la llista.";
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
    elements.logFormNotes.value = context.defaultNotes || "";
  }
  if (!elements.logFormWeight.value && typeof context.defaultWeightKg === "number") {
    elements.logFormWeight.value = String(context.defaultWeightKg);
  }
  elements.logFormSubmit.disabled = false;
  elements.logFormStatus.textContent = state.activeSessionId
    ? `Exercici reconegut: ${context.title}. El registre anira a la sessio activa i a l'historic local.`
    : `Exercici reconegut: ${context.title}. Completa les dades i desa'l a l'historic local.`;
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
  elements.logFormWeight.value = typeof context.defaultWeightKg === "number" ? String(context.defaultWeightKg) : "";
  elements.logFormNotes.value = context.defaultNotes || "";
  elements.logFormSubmit.disabled = false;
  elements.logFormStatus.textContent = state.activeSessionId
    ? `Registrant ${context.title}. Aquest registre s'afegira a la sessio activa i a l'historic local.`
    : `Registrant ${context.title}. Aquest registre es guardara a l'historic local.`;
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
  elements.logNextActions.hidden = true;
  elements.logFormSubmit.disabled = true;
  elements.logFormStatus.textContent = statusText || "Selecciona un exercici conegut per registrar-lo.";
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
  elements.calendarTitle.textContent = calendar.title;
  elements.historyCalendar.innerHTML = "";

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
    item.className = "history-item";
    item.innerHTML = `
      <strong>Historic encara buit</strong>
      <span>Registra el primer exercici per omplir calendari i mapa corporal.</span>
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

  elements.historySummary.textContent = state.usageStats.total > 0
    ? `${state.usageStats.total} usos registrats. Les recomanacions compensen zones menys treballades.`
    : "Sense historial encara. Registra el primer exercici.";

  renderBalanceMap();
}

function hydrateCardGallery({ gallery, galleryDots, galleryPrev, galleryNext, product }) {
  const imageUrls = Array.from(new Set([...(product.imageUrls || []), product.heroImage].filter(Boolean)));
  const slides = imageUrls.length ? imageUrls : ["assets/icons/icon-192.png"];

  gallery.innerHTML = slides
    .map((url, index) => `
      <figure class="machine-card__slide" data-slide-index="${index}">
        <img class="machine-card__image" src="${escapeHtml(url)}" alt="${escapeHtml(`${product.title} - foto ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer">
      </figure>
    `)
    .join("");

  const hasMultiple = slides.length > 1;
  galleryDots.hidden = !hasMultiple;
  galleryPrev.hidden = !hasMultiple;
  galleryNext.hidden = !hasMultiple;

  if (!hasMultiple) {
    galleryDots.innerHTML = "";
    return;
  }

  galleryDots.innerHTML = slides
    .map((_, index) => `<button class="machine-card__gallery-dot${index === 0 ? " is-active" : ""}" type="button" data-gallery-index="${index}" aria-label="Foto ${index + 1}"></button>`)
    .join("");

  const syncActiveDot = () => {
    const index = Math.round(gallery.scrollLeft / Math.max(gallery.clientWidth, 1));
    galleryDots.querySelectorAll("[data-gallery-index]").forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
  };

  galleryDots.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-gallery-index]");
    if (!dot) {
      return;
    }
    const index = Number(dot.dataset.galleryIndex || 0);
    gallery.scrollTo({ left: index * gallery.clientWidth, behavior: "smooth" });
  });
  galleryPrev.addEventListener("click", () => {
    const index = Math.max(0, Math.round(gallery.scrollLeft / Math.max(gallery.clientWidth, 1)) - 1);
    gallery.scrollTo({ left: index * gallery.clientWidth, behavior: "smooth" });
  });
  galleryNext.addEventListener("click", () => {
    const currentIndex = Math.round(gallery.scrollLeft / Math.max(gallery.clientWidth, 1));
    const index = Math.min(slides.length - 1, currentIndex + 1);
    gallery.scrollTo({ left: index * gallery.clientWidth, behavior: "smooth" });
  });
  gallery.addEventListener("scroll", syncActiveDot, { passive: true });
}

function buildCard(product, options) {
  const fragment = elements.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".machine-card");
  const gallery = fragment.querySelector(".machine-card__gallery");
  const galleryDots = fragment.querySelector(".machine-card__gallery-dots");
  const galleryPrev = fragment.querySelector(".machine-card__gallery-nav--prev");
  const galleryNext = fragment.querySelector(".machine-card__gallery-nav--next");
  const type = fragment.querySelector(".machine-card__type");
  const series = fragment.querySelector(".machine-card__series");
  const title = fragment.querySelector(".machine-card__title");
  const focusLabel = fragment.querySelector(".machine-card__focus-label");
  const cue = fragment.querySelector(".machine-card__cue");
  const muscleMap = fragment.querySelector(".machine-card__muscle-map");
  const description = fragment.querySelector(".machine-card__description");
  const muscles = fragment.querySelector(".machine-card__muscles");
  const collections = fragment.querySelector(".machine-card__collections");
  const link = fragment.querySelector(".machine-card__link");
  const toggle = fragment.querySelector(".machine-card__toggle");
  const logButton = fragment.querySelector(".machine-card__log");
  const canToggleAvailability = options.allowToggle !== false && supportsAvailabilityToggle(product);
  const readOnly = options.readOnly === true;

  card.classList.toggle("machine-card--bodyweight", product.equipmentType === "bodyweight");
  hydrateCardGallery({ gallery, galleryDots, galleryPrev, galleryNext, product });
  type.textContent = labelForEquipmentType(product.equipmentType);
  series.textContent = product.series || "";
  title.textContent = product.title;
  const primaryMuscle = pickPrimaryMuscle(product.muscleGroups);
  focusLabel.textContent = buildMachineActionSummary(product, primaryMuscle);
  cue.textContent = buildMachineCue(product, primaryMuscle);
  muscleMap.innerHTML = buildMuscleAvatarMarkup(primaryMuscle, product.muscleGroups || []);
  muscleMap.setAttribute("aria-label", `Muscul principal ${labelForMuscle(primaryMuscle)}`);
  description.textContent = buildCardDescription(product, options, primaryMuscle);
  link.hidden = !product.sourceUrl;
  if (product.sourceUrl) {
    link.href = product.sourceUrl;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      openMachineSheet(product);
    });
  } else {
    link.removeAttribute("href");
  }
  toggle.textContent = options.hiddenMode ? "Recupera" : "No hi es";
  toggle.hidden = !canToggleAvailability || readOnly;
  logButton.hidden = options.hiddenMode || readOnly;
  logButton.textContent = state.activeSessionId ? "Afegeix a sessio" : "Feta avui";

  if (canToggleAvailability && !readOnly) {
    toggle.addEventListener("click", () => toggleMachine(product.id, options.hiddenMode));
  }
  if (!readOnly) {
    logButton.addEventListener("click", () => logUsage(product));
  }

  for (const muscle of product.muscleGroups.slice(0, 4)) {
    muscles.append(buildTag(labelForMuscle(muscle)));
  }

  for (const collection of product.collections.slice(0, 3)) {
    collections.append(buildTag(collection));
  }

  return fragment;
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
    renderMachineSheet(product, cached);
    return;
  }

  const provider = CATALOG_PROVIDERS.find((entry) => entry.id === product.providerId);
  if (!provider) {
    renderMachineSheetError(product);
    return;
  }

  const requestToken = ++state.machineSheetRequestToken;

  try {
    const sheet = await fetchProductInstructionSheet(product, provider);
    if (requestToken !== state.machineSheetRequestToken || elements.machineSheetModal.hidden) {
      return;
    }
    state.machineSheetCache[product.id] = sheet;
    renderMachineSheet(product, sheet);
  } catch (error) {
    console.error(error);
    if (requestToken !== state.machineSheetRequestToken || elements.machineSheetModal.hidden) {
      return;
    }
    renderMachineSheetError(product);
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

function renderMachineSheet(product, sheet) {
  const muscleTags = product.muscleGroups
    .slice(0, 4)
    .map((muscle) => `<span class="tag">${escapeHtml(labelForMuscle(muscle))}</span>`)
    .join("");
  const sections = sheet.sections
    .map((section) => `
      <article class="sheet-placard__section">
        <h4>${escapeHtml(section.label)}</h4>
        <p>${escapeHtml(section.content)}</p>
      </article>
    `)
    .join("");

  elements.machineSheetStatus.hidden = true;
  elements.machineSheetBody.innerHTML = `
    <section class="sheet-placard" aria-label="Esquema d'instruccions">
      <div class="sheet-placard__hero">
        <p class="sheet-placard__eyebrow">Etiqueta resumida</p>
        <h4>${escapeHtml(sheet.title || product.title)}</h4>
        <p class="sheet-placard__caption">Fragment extret de la fitxa publica d'F&amp;H per ensenyar nomes la part operativa.</p>
      </div>
      <div class="tag-row sheet-placard__tags">
        <span class="tag">${escapeHtml(labelForEquipmentType(product.equipmentType))}</span>
        ${muscleTags}
      </div>
      <div class="sheet-placard__grid">
        ${sections || `<article class="sheet-placard__section"><h4>Fitxa</h4><p>No hem pogut resumir cap instruccio concreta en aquesta maquina.</p></article>`}
      </div>
    </section>
  `;
}

function renderMachineSheetError(product) {
  elements.machineSheetStatus.hidden = true;
  elements.machineSheetBody.innerHTML = `
    <section class="sheet-placard sheet-placard--empty" aria-label="Sense esquema">
      <div class="sheet-placard__hero">
        <p class="sheet-placard__eyebrow">Fitxa no disponible</p>
        <h4>${escapeHtml(product.title)}</h4>
        <p class="sheet-placard__caption">No hem pogut localitzar un esquema d'instruccions separat. Pots obrir la fitxa original com a fallback.</p>
      </div>
    </section>
  `;
}

function buildTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function supportsAvailabilityToggle(product) {
  return Boolean(product.providerId && product.providerId !== "bodyweight");
}

function labelForEquipmentType(type) {
  if (type === "machine") {
    return "Maquina";
  }
  if (type === "free-weight") {
    return "Pes lliure";
  }
  if (type === "bodyweight") {
    return "Sense maquines";
  }
  if (type === "custom") {
    return "Pla propi";
  }
  return "Suport";
}

function pickPrimaryMuscle(muscleGroups) {
  const ranked = ["chest", "back", "shoulders", "legs", "hamstrings", "glutes", "calves", "core", "biceps", "triceps", "cardio"];
  return ranked.find((muscle) => muscleGroups?.includes(muscle)) || muscleGroups?.[0] || "all";
}

function labelForMuscle(muscle) {
  return MUSCLE_GROUPS.find((item) => item.id === muscle)?.label || "General";
}

function buildMachineActionSummary(product, primaryMuscle) {
  const normalized = normalizeLookupText(`${product.title} ${product.handle || ""} ${(product.collections || []).join(" ")}`);
  const action = inferMachineAction(normalized, primaryMuscle, product.equipmentType);
  return `${action} · ${labelForMuscle(primaryMuscle)}`;
}

function buildMachineCue(product, primaryMuscle) {
  const normalized = normalizeLookupText(`${product.title} ${product.handle || ""}`);
  if (product.equipmentType === "bodyweight") {
    return "Controla el rang, mantingues tecnica neta i evita l'impuls.";
  }
  if (normalized.includes("press") || normalized.includes("bench") || normalized.includes("pec")) {
    return "Ajusta el seient i empeny amb recorregut controlat.";
  }
  if (normalized.includes("row") || normalized.includes("remo") || normalized.includes("pulldown") || normalized.includes("lat")) {
    return "Pit obert, tracciona cap a tu i controla la tornada.";
  }
  if (normalized.includes("curl")) {
    return "Mou el colze sense balancejar el tronc.";
  }
  if (normalized.includes("extension")) {
    return primaryMuscle === "legs"
      ? "Esten el genoll sense cop sec al final."
      : "Esten el colze amb control i sense impuls.";
  }
  if (normalized.includes("leg press") || normalized.includes("squat") || normalized.includes("hack")) {
    return "Peus ferms, baixa controlat i empeny sense rebot.";
  }
  if (normalized.includes("abductor") || normalized.includes("adductor")) {
    return "Pelvis estable i recorregut net en cada rep.";
  }
  if (normalized.includes("calf")) {
    return "Eleva talons amb pausa curta a dalt i baixa lent.";
  }
  if (primaryMuscle === "cardio") {
    return "Mantingues ritme constant i postura estable.";
  }
  return "Ajusta la postura i completa el recorregut sense impuls.";
}

function inferMachineAction(normalizedTitle, primaryMuscle, equipmentType) {
  if (equipmentType === "bodyweight") {
    return "Exercici sense maquina";
  }
  if (primaryMuscle === "cardio") {
    return "Treball cardiovascular";
  }
  if (normalizedTitle.includes("leg press") || normalizedTitle.includes("hack") || normalizedTitle.includes("squat")) {
    return "Empenta de cames";
  }
  if (normalizedTitle.includes("extension")) {
    return primaryMuscle === "legs" ? "Extensio de cames" : "Extensio guiada";
  }
  if (normalizedTitle.includes("curl")) {
    return primaryMuscle === "hamstrings" ? "Curl femoral" : "Curl de bracos";
  }
  if (normalizedTitle.includes("pulldown") || normalizedTitle.includes("lat")) {
    return "Tirada vertical";
  }
  if (normalizedTitle.includes("row") || normalizedTitle.includes("remo")) {
    return "Rem guiat";
  }
  if (normalizedTitle.includes("press") || normalizedTitle.includes("bench") || normalizedTitle.includes("pec")) {
    return primaryMuscle === "shoulders" ? "Press d'espatlles" : "Press guiat";
  }
  if (normalizedTitle.includes("abductor")) {
    return "Abduccio de maluc";
  }
  if (normalizedTitle.includes("adductor")) {
    return "Adduccio de maluc";
  }
  if (normalizedTitle.includes("calf")) {
    return "Elevacio de bessons";
  }
  if (normalizedTitle.includes("glute") || normalizedTitle.includes("hip thrust") || normalizedTitle.includes("kickback")) {
    return "Treball de glutis";
  }
  if (normalizedTitle.includes("ab") || normalizedTitle.includes("crunch") || normalizedTitle.includes("core")) {
    return "Treball de core";
  }
  return primaryMuscle === "all" ? "Maquina guiada" : `Treball de ${labelForMuscle(primaryMuscle).toLowerCase()}`;
}

function buildCardDescription(product, options, primaryMuscle) {
  const detailParts = options.showPrescription
    ? [
        product.prescription || "",
        formatSuggestedWeightCompact(product),
        product.progressionHint ? trimSentence(product.progressionHint, 56) : ""
      ]
    : [
        buildSecondaryMuscleSummary(product.muscleGroups, primaryMuscle),
        formatLastWeightCompact(product.id)
      ];

  const detail = detailParts.filter(Boolean).join(" • ");
  if (detail) {
    return detail;
  }
  if (options.showPrescription) {
    return buildSecondaryMuscleSummary(product.muscleGroups, primaryMuscle) || "Ajusta pes i manten tecnica neta.";
  }
  return trimSentence(product.description, 96) || `Treball principal ${labelForMuscle(primaryMuscle).toLowerCase()}.`;
}

function buildSecondaryMuscleSummary(muscleGroups, primaryMuscle) {
  const secondary = (muscleGroups || [])
    .filter((muscle) => muscle !== primaryMuscle && muscle !== "all")
    .slice(0, 2)
    .map((muscle) => labelForMuscle(muscle).toLowerCase());
  return secondary.length ? `Suport ${secondary.join(" + ")}` : "";
}

function buildMuscleAvatarMarkup(primaryMuscle, muscleGroups) {
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

function zonesForMuscles(muscles) {
  const zoneMap = {
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
  return muscles.flatMap((muscle) => zoneMap[muscle] || []);
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
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  if (routine.exercises.length === 0) {
    return;
  }

  const activeSession = getActiveSession();
  const nextPlan = buildGuidedPlan(routine, recommendationPool);
  if (activeSession?.guidedPlan?.steps?.some((step) => step.status === "done" || step.status === "skipped")) {
    renderAll();
    return;
  }

  if (activeSession) {
    activeSession.guidedPlan = nextPlan;
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

async function handleTodayPlanAlternative() {
  if (elements.todayPlanAlternatives && !elements.todayPlanAlternatives.hidden) {
    elements.todayPlanAlternatives.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    elements.todayPlanAlternatives.querySelector("[data-alt-index]")?.focus();
    return;
  }

  const activeSession = await ensureGuidedPlanSession();
  const plan = activeSession?.guidedPlan;
  const currentStep = getCurrentGuidedStep(plan);
  if (!activeSession || !plan || !currentStep || !currentStep.alternativeOptions?.length) {
    return;
  }

  await applyGuidedAlternativeSwap(activeSession, currentStep, 0);
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

async function ensureGuidedPlanSession() {
  let session = getActiveSession();
  if (session?.guidedPlan?.steps?.length && getCurrentGuidedStep(session.guidedPlan)) {
    return session;
  }

  const recommendationPool = getRecommendationPool();
  const routine = buildRoutine(recommendationPool, state, state.usageStats);
  if (routine.exercises.length === 0) {
    return null;
  }

  session = await ensureActiveWorkoutSession();
  session.guidedPlan = buildGuidedPlan(routine, recommendationPool);
  session.guidedPlan.startedAt = new Date().toISOString();
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
  const fallbackOption = buildGuidedStepPayload(previousStepSnapshot, currentStep.position - 1, currentStep.totalSteps, null, true);
  fallbackOption.alternativeOptions = [];
  currentStep.alternativeOptions = dedupeAlternativeOptions([...remainingOptions, fallbackOption], currentStep.title);
  const plan = activeSession.guidedPlan;
  plan.updatedAt = new Date().toISOString();
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

function getCurrentGuidedStep(plan) {
  return plan?.steps?.find((step) => step.status === "pending") || null;
}

function dedupeAlternativeOptions(options, currentTitle) {
  const seen = new Set([normalizeLookupText(currentTitle)]);
  return (options || []).filter((option) => {
    const key = normalizeLookupText(option.title);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function copyGuidedStepFields(target, source) {
  const keys = [
    "productId",
    "exerciseId",
    "title",
    "brand",
    "providerId",
    "description",
    "collections",
    "collectionHandles",
    "equipmentType",
    "series",
    "muscleGroups",
    "loadSystem",
    "stepKg",
    "baseResistanceKg",
    "availablePlatesKg",
    "imageUrls",
    "heroImage",
    "searchText",
    "sourceUrl",
    "updatedAt",
    "sourceType",
    "movementPattern",
    "machineReplacements",
    "equipment",
    "level",
    "progressions",
    "regressions",
    "safetyNotes",
    "recommendationScore",
    "recommendationReason",
    "prescription",
    "suggestedWeightKg",
    "progressionHint",
    "setsTarget",
    "repsTarget",
    "restSeconds",
    "transitionSeconds",
    "stationMinutes",
    "movementFamily"
  ];

  keys.forEach((key) => {
    target[key] = source[key];
  });
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

function splitPrescription(prescription) {
  const text = String(prescription || "").trim();
  if (!text) {
    return { setsTarget: "", repsTarget: "" };
  }
  const [setsPart, repsPart] = text.split(" x ");
  return {
    setsTarget: (setsPart || "").replace(/\s*series.*$/i, "").trim(),
    repsTarget: (repsPart || "").trim()
  };
}

function estimateRestSeconds(profile) {
  if (state.selectedObjective === "strength") {
    return profile.growthPotential === "high" ? 105 : 75;
  }
  if (state.selectedObjective === "fat-loss" || state.selectedObjective === "quick") {
    return 35;
  }
  if (state.selectedObjective === "endurance") {
    return 30;
  }
  if (state.selectedObjective === "mobility" || state.selectedObjective === "recovery") {
    return 40;
  }
  return profile.growthPotential === "high" ? 75 : 55;
}

function estimateTransitionSeconds(previousStep, nextExercise) {
  if (!previousStep) {
    return 0;
  }
  if (previousStep.equipmentType === "bodyweight" && nextExercise.equipmentType === "bodyweight") {
    return 20;
  }
  const sameCollection = (previousStep.collections || []).some((collection) => (nextExercise.collections || []).includes(collection));
  if (sameCollection) {
    return 40;
  }
  if (previousStep.movementFamily && previousStep.movementFamily === buildProgressionProfile(nextExercise).family) {
    return 45;
  }
  return 60;
}

function estimateStationMinutes({ exercise, restSeconds, setsTarget, repsTarget, profile }) {
  const sets = parseRangeAverage(setsTarget, 3);
  const workSeconds = estimateWorkSeconds(repsTarget, profile);
  const setupSeconds = profile.loadSystem === "plate_loaded"
    ? 50
    : profile.loadSystem === "stack"
      ? 30
      : 20;
  const totalSeconds = setupSeconds + sets * workSeconds + Math.max(0, sets - 1) * restSeconds;
  return clamp(round(totalSeconds / 60, 1), 3, 12);
}

function estimateWorkSeconds(repsTarget, profile) {
  const target = String(repsTarget || "").toLowerCase();
  if (target.includes("min")) {
    return parseRangeAverage(target, 1) * 60;
  }
  if (target.includes("s")) {
    return parseRangeAverage(target, 30);
  }
  const reps = parseRangeAverage(target, profile.growthPotential === "high" ? 8 : 10);
  return clamp(reps * 3.5, 20, 75);
}

function parseRangeAverage(value, fallback) {
  const matches = String(value || "").match(/\d+/g);
  if (!matches?.length) {
    return fallback;
  }
  const numbers = matches.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  if (!numbers.length) {
    return fallback;
  }
  return numbers.reduce((sum, entry) => sum + entry, 0) / numbers.length;
}

function parseAverageReps(reps) {
  if (!reps) {
    return 0;
  }
  const matches = String(reps).match(/\d+/g);
  if (!matches || matches.length === 0) {
    return 0;
  }
  const values = matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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
    allRegion.style.opacity = available > 0 ? "0.16" : "0";
  }

  const ranked = Object.entries(scores)
    .sort((left, right) => left[1] - right[1])
    .map(([muscle, score]) => `${labelForMuscle(muscle)} ${Math.round(score * 100)}%`);

  elements.balanceLegend.innerHTML = ranked.length > 0
    ? [`Fiabilitat ${labelForConfidence(meta.confidence)}`, ...ranked].map((entry) => `<span class="tag">${entry}</span>`).join("")
    : `<span class="tag">Sense prou dades encara</span>`;

  if (available === 0) {
    elements.balanceSummary.textContent = "Cal registrar pes en diverses zones per omplir el mapa.";
    return;
  }

  elements.balanceSummary.textContent = meta.hasEnoughData
    ? `Mapa ajustat amb factors relatius per grup muscular. Verd mes fort dins el teu historic; vermell mes endarrerit.`
    : `Lectura preliminar ajustada amb factors relatius. Cal mes historic perque la comparacio sigui fiable.`;
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
    elements.notificationStatus.textContent = "Aquest navegador no exposa la Notifications API. GymBro's fara servir avisos dins l'app i so local.";
    return;
  }

  if (!standalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    elements.notificationStatus.textContent = "A iOS les notificacions completes per PWA requereixen tenir GymBro's instal.lada a la pantalla d'inici.";
    return;
  }

  if (/Android/i.test(navigator.userAgent)) {
    elements.notificationStatus.textContent = `Android detectat. Estat dels avisos: ${Notification.permission}.`;
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
    elements.notificationStatus.textContent = "Aquest navegador no suporta Screen Wake Lock.";
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
    elements.notificationStatus.textContent = "No s'ha pogut activar el bloqueig de pantalla.";
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
    elements.bodyMapHost.innerHTML = markup;
    const svg = elements.bodyMapHost.querySelector("svg");
    if (svg) {
      svg.classList.add("body-map");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("focusable", "false");
    }
  } catch (error) {
    console.error(error);
    elements.balanceSummary.textContent = "No s'ha pogut carregar el mapa corporal.";
  }
}
