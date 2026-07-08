import { normalizeLookupText } from "./logging-catalog.js";
import { buildFocusAvatarMarkup, getSelectedMuscleIds, pickPrimaryMuscle } from "./muscle-ui.js";
import { buildProgressionProfile } from "./proportionality.js";

export function getRenderableGuidedPlan(activePlan, recommendationPool, routine, planContext) {
  if (activePlan?.steps?.length) {
    return activePlan;
  }
  if (!routine?.exercises?.length) {
    return null;
  }
  return buildGuidedPlan(routine, recommendationPool, planContext);
}

export function buildGuidedPlan(routine, recommendationPool, planContext) {
  if (!routine?.exercises?.length) {
    return null;
  }

  const selectedIds = new Set(routine.exercises.map((exercise) => exercise.id));
  const selectedTitles = new Set(routine.exercises.map((exercise) => normalizeLookupText(exercise.title)).filter(Boolean));
  const steps = [];

  routine.exercises.forEach((exercise, index) => {
    const previous = steps[steps.length - 1] || null;
    const step = buildGuidedPlanStep({
      exercise,
      index,
      total: routine.exercises.length,
      previousStep: previous,
      recommendationPool,
      selectedIds,
      selectedTitles,
      objective: planContext.selectedObjective
    });
    steps.push(step);
  });

  scaleGuidedStepMinutes(steps, routine.duration.value);

  const totalTransitionSeconds = steps.reduce((sum, step) => sum + step.transitionSeconds, 0);
  const totalStationMinutes = steps.reduce((sum, step) => sum + step.stationMinutes, 0);

  return {
    id: `preview:${routine.duration.value}:${planContext.selectedObjective}:${getSelectedMuscleIds(planContext.selectedMuscle).join(",") || "all"}:${planContext.selectedEquipmentType}:${planContext.selectedBrand}:${planContext.searchQuery}`,
    createdAt: new Date().toISOString(),
    objective: planContext.selectedObjective,
    durationMinutes: routine.duration.value,
    durationLabel: routine.duration.label,
    explanation: routine.explanation,
    totalSteps: steps.length,
    totalStationMinutes,
    totalTransitionSeconds,
    totalEstimatedMinutes: round(totalStationMinutes + totalTransitionSeconds / 60, 1),
    steps
  };
}

export function renderTodayPlanView({
  elements,
  activePlan,
  fallbackPlan,
  routine,
  todayPlanStage,
  setTodayPlanStage,
  supportsAvailabilityToggle,
  formatSuggestedWeight,
  formatSuggestedWeightCompact,
  formatMinutes,
  formatTransition,
  buildMachineActionSummary,
  buildCard,
  escapeHtml
}) {
  if (!elements.todayPlanSummary || !elements.todayPlanCurrent) {
    return;
  }

  const renderPlan = activePlan?.steps?.length ? activePlan : fallbackPlan;
  const currentStep = getCurrentGuidedStep(renderPlan);
  const completedCount = renderPlan?.steps?.filter((step) => step.status === "done").length || 0;
  const skippedCount = renderPlan?.steps?.filter((step) => step.status === "skipped").length || 0;
  const hasStartedPlan = Boolean(activePlan?.steps?.length);
  const hasAlternatives = Boolean(currentStep?.alternativeOptions?.length);
  const canHideCurrentMachine = Boolean(currentStep && supportsAvailabilityToggle(currentStep));
  const canSwitchCurrentMachine = Boolean(currentStep && (hasAlternatives || canHideCurrentMachine));

  if (!hasStartedPlan || !currentStep || !canSwitchCurrentMachine) {
    setTodayPlanStage("current");
  }

  if (!renderPlan) {
    elements.todayPlanSummary.textContent = "Sense proposta directa amb aquest context.";
    elements.todayPlanCurrent.innerHTML = `
      <strong>Cap sessió preparada</strong>
      <span>Canvia el focus o passa a una ruta que no depengui del catàleg.</span>
    `;
    elements.todayPlanStart.disabled = true;
    elements.todayPlanStart.hidden = true;
    elements.todayPlanLog.disabled = true;
    elements.todayPlanSkip.disabled = true;
    elements.todayPlanRefresh.disabled = true;
    elements.todayPlanLog.hidden = true;
    elements.todayPlanSkip.hidden = true;
    elements.todayPlanStageTabs.hidden = true;
    elements.todayPlanStageCurrentPanel.hidden = false;
    elements.todayPlanStageSwitchPanel.hidden = true;
    if (elements.todayPlanEmptyActions) {
      elements.todayPlanEmptyActions.hidden = false;
    }
    if (elements.todayPlanOccupied) {
      elements.todayPlanOccupied.disabled = true;
    }
    if (elements.todayPlanHide) {
      elements.todayPlanHide.disabled = true;
    }
    renderTodayPlanAlternativesView({ elements, currentStep: null, formatSuggestedWeightCompact, buildMachineActionSummary, escapeHtml });
    return;
  }

  elements.todayPlanSummary.textContent = hasStartedPlan
    ? `${renderPlan.totalSteps} passos - ${renderPlan.totalEstimatedMinutes} min - ${completedCount} fets${skippedCount ? ` - ${skippedCount} saltats` : ""}`
    : `${renderPlan.totalSteps} passos - ${renderPlan.totalEstimatedMinutes} min - ${routine.explanation}`;

  elements.todayPlanStart.textContent = hasStartedPlan ? "Continua sessió guiada" : "Comença sessió guiada";
  elements.todayPlanStart.disabled = false;
  elements.todayPlanStart.hidden = Boolean(hasStartedPlan && currentStep);
  elements.todayPlanLog.disabled = !currentStep;
  elements.todayPlanSkip.disabled = !currentStep;
  elements.todayPlanRefresh.disabled = hasStartedPlan && completedCount > 0;
  elements.todayPlanLog.hidden = !hasStartedPlan || !currentStep;
  elements.todayPlanSkip.hidden = !hasStartedPlan || !currentStep;
  elements.todayPlanStageTabs.hidden = !hasStartedPlan || !canSwitchCurrentMachine;
  elements.todayPlanStageCurrentPanel.hidden = hasStartedPlan && canSwitchCurrentMachine && todayPlanStage === "switch";
  elements.todayPlanStageSwitchPanel.hidden = !hasStartedPlan || !canSwitchCurrentMachine || todayPlanStage !== "switch";
  if (elements.todayPlanEmptyActions) {
    elements.todayPlanEmptyActions.hidden = true;
  }
  elements.todayPlanStageCurrent?.classList.toggle("is-active", todayPlanStage !== "switch");
  elements.todayPlanStageSwitch?.classList.toggle("is-active", todayPlanStage === "switch");
  if (elements.todayPlanOccupied) {
    elements.todayPlanOccupied.disabled = !hasAlternatives;
  }
  if (elements.todayPlanHide) {
    elements.todayPlanHide.disabled = !canHideCurrentMachine;
  }

  if (!currentStep) {
    elements.todayPlanCurrent.innerHTML = `
      <strong>Sessió del dia completada</strong>
      <span>Tot fet. Pots revisar l'històric o recalcular.</span>
    `;
    elements.todayPlanStart.hidden = true;
    elements.todayPlanLog.hidden = true;
    elements.todayPlanSkip.hidden = true;
    elements.todayPlanStageTabs.hidden = true;
    elements.todayPlanStageSwitchPanel.hidden = true;
    if (elements.todayPlanEmptyActions) {
      elements.todayPlanEmptyActions.hidden = true;
    }
    renderTodayPlanAlternativesView({ elements, currentStep: null, formatSuggestedWeightCompact, buildMachineActionSummary, escapeHtml });
    return;
  }

  const nextAlternative = currentStep.alternativeOptions?.[0];
  const stationLabel = currentStep.equipmentType === "bodyweight" ? "a l'estació" : "a la màquina";
  const pieces = [
    `<strong>Pas ${currentStep.position}/${currentStep.totalSteps}: ${escapeHtml(currentStep.title)}</strong>`,
    `<span>${escapeHtml(currentStep.prescription || "Sense rang calculat")} - ${formatMinutes(currentStep.stationMinutes)} ${stationLabel} - ${formatTransition(currentStep.transitionSeconds)}</span>`,
    typeof currentStep.suggestedWeightKg === "number" ? `<span>${escapeHtml(formatSuggestedWeight(currentStep).replace(/^ - /, ""))}</span>` : "",
    nextAlternative
      ? `<span>Alternativa semblant: ${escapeHtml(nextAlternative.title)}.</span>`
      : canHideCurrentMachine
        ? `<span>Si no hi és al teu gimnús, l'amaguem i reconfigurem la sessió.</span>`
        : `<span>Sense alternativa directa.</span>`
  ].filter(Boolean);
  elements.todayPlanCurrent.innerHTML = pieces.join("");
  renderTodayPlanAlternativesView({ elements, currentStep, formatSuggestedWeightCompact, buildMachineActionSummary, escapeHtml });
}

export function buildGuidedPlanCardFragment(step, isCurrent, helpers) {
  const fragment = helpers.buildCard(step, { hiddenMode: false, showPrescription: true, readOnly: true }, helpers.machineCardContext);
  const card = fragment.querySelector(".machine-card");
  const body = fragment.querySelector(".machine-card__body");
  const actions = body.querySelector(".machine-card__actions");
  const metaRow = document.createElement("div");
  metaRow.className = "tag-row";
  metaRow.innerHTML = [
    `<span class="tag">Pas ${step.position}/${step.totalSteps}</span>`,
    `<span class="tag">${helpers.formatMinutes(step.stationMinutes)} màquina</span>`,
    `<span class="tag">${helpers.formatTransition(step.transitionSeconds)}</span>`,
    step.status === "done"
      ? "<span class=\"tag\">Fet</span>"
      : step.status === "skipped"
        ? "<span class=\"tag\">Saltat</span>"
        : `<span class="tag">${step.alternativeOptions?.length || 0} alternatives disponibles</span>`
  ].join("");
  body.insertBefore(metaRow, body.querySelector(".machine-card__description"));
  const alternativesRail = buildGuidedPlanAlternativeRail(step, helpers);
  if (alternativesRail) {
    if (actions) {
      body.insertBefore(alternativesRail, actions);
    } else {
      body.append(alternativesRail);
    }
  }
  card.classList.add("machine-card--guided");
  card.dataset.guidedStepPosition = String(step.position);
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

export function pickAlternativeExercises(exercise, recommendationPool, selectedIds, selectedTitles = new Set()) {
  const sourceMuscles = new Set(exercise.muscleGroups || []);
  const currentProductId = exercise.productId || exercise.id;
  const currentTitleKey = normalizeLookupText(exercise.title);
  const ranked = recommendationPool
    .filter((candidate) => {
      const titleKey = normalizeLookupText(candidate.title);
      return candidate.id !== currentProductId
        && !selectedIds.has(candidate.id)
        && (!titleKey || (!selectedTitles.has(titleKey) && titleKey !== currentTitleKey));
    })
    .map((candidate) => ({
      candidate,
      score: overlapScore(exercise, sourceMuscles, candidate)
    }))
    .sort((left, right) => right.score - left.score || right.candidate.recommendationScore - left.candidate.recommendationScore);

  const positiveMatches = ranked.filter((entry) => entry.score > 0);
  return (positiveMatches.length > 0 ? positiveMatches : ranked).map((entry) => entry.candidate);
}

export function getCurrentGuidedStep(plan) {
  return plan?.steps?.find((step) => step.status === "pending") || null;
}

export function dedupeAlternativeOptions(options, currentTitle) {
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

export function enforceGuidedPlanUniqueness(plan, recommendationPool, pinnedStepId = null) {
  if (!plan?.steps?.length) {
    return;
  }

  const usedProductIds = new Set();
  const usedTitles = new Set();
  const objective = plan.objective || "hypertrophy";

  plan.steps.forEach((step) => {
    const titleKey = normalizeLookupText(step.title);
    const productKey = step.productId || step.id;
    const isPinned = pinnedStepId && step.id === pinnedStepId;
    const isDuplicate = (!isPinned && productKey && usedProductIds.has(productKey))
      || (!isPinned && titleKey && usedTitles.has(titleKey));

    if (isDuplicate && step.status === "pending") {
      const replacement = findUniqueGuidedReplacement(step, plan, recommendationPool, usedProductIds, usedTitles);
      if (replacement) {
        const preservedId = step.id;
        const swapCount = step.swapCount || 0;
        const alternativeOf = step.alternativeOf || null;
        copyGuidedStepFields(step, replacement);
        step.id = preservedId;
        step.swapCount = swapCount;
        step.alternativeOf = alternativeOf;
      }
    }

    const nextTitleKey = normalizeLookupText(step.title);
    const nextProductKey = step.productId || step.id;
    if (nextProductKey) {
      usedProductIds.add(nextProductKey);
    }
    if (nextTitleKey) {
      usedTitles.add(nextTitleKey);
    }
  });

  plan.steps.forEach((step, index) => {
    const blockedProductIds = new Set(
      plan.steps
        .filter((entry) => entry.id !== step.id)
        .map((entry) => entry.productId || entry.id)
        .filter(Boolean)
    );
    const blockedTitles = new Set(
      plan.steps
        .filter((entry) => entry.id !== step.id)
        .map((entry) => normalizeLookupText(entry.title))
        .filter(Boolean)
    );
    const previousStep = index > 0 ? plan.steps[index - 1] : null;
    step.alternativeOptions = pickAlternativeExercises(step, recommendationPool, blockedProductIds, blockedTitles)
      .slice(0, 3)
      .map((candidate) => buildGuidedStepPayload(candidate, index, plan.steps.length, previousStep, objective, true));
  });
}

export function reconfigureGuidedPlanAfterPermanentHide(plan, hiddenProductId, recommendationPool) {
  const outcome = { replaced: 0, skipped: 0 };
  if (!plan?.steps?.length || !hiddenProductId) {
    return outcome;
  }

  const objective = plan.objective || "hypertrophy";
  const usedProductIds = new Set(
    plan.steps
      .filter((entry) => entry.status !== "pending" || entry.productId !== hiddenProductId)
      .map((entry) => entry.productId || entry.id)
      .filter(Boolean)
  );
  const usedTitles = new Set(
    plan.steps
      .filter((entry) => entry.status !== "pending" || entry.productId !== hiddenProductId)
      .map((entry) => normalizeLookupText(entry.title))
      .filter(Boolean)
  );
  const blockedProductIds = new Set([hiddenProductId]);

  plan.steps.forEach((step) => {
    if (step.status !== "pending" || step.productId !== hiddenProductId) {
      return;
    }

    const replacement = findUniqueGuidedReplacement(step, plan, recommendationPool, usedProductIds, usedTitles, blockedProductIds);
    if (replacement) {
      const preservedId = step.id;
      const previousTitle = step.title;
      copyGuidedStepFields(step, replacement);
      step.id = preservedId;
      step.status = "pending";
      step.completedAt = null;
      step.skippedAt = null;
      step.skipReason = null;
      step.alternativeOf = step.alternativeOf || previousTitle;
      step.swapCount = (step.swapCount || 0) + 1;
      const titleKey = normalizeLookupText(step.title);
      const productKey = step.productId || step.id;
      if (productKey) {
        usedProductIds.add(productKey);
      }
      if (titleKey) {
        usedTitles.add(titleKey);
      }
      outcome.replaced += 1;
      return;
    }

    step.status = "skipped";
    step.skippedAt = new Date().toISOString();
    step.skipReason = "machine-unavailable";
    outcome.skipped += 1;
  });

  enforceGuidedPlanUniqueness(plan, recommendationPool);
  return outcome;
}

export function copyGuidedStepFields(target, source) {
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

export function splitPrescription(prescription) {
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

export function parseAverageReps(reps) {
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

function buildGuidedPlanStep({ exercise, index, total, previousStep, recommendationPool, selectedIds, selectedTitles, objective }) {
  const payload = buildGuidedStepPayload(exercise, index, total, previousStep, objective);
  const alternativeOptions = pickAlternativeExercises(exercise, recommendationPool, selectedIds, selectedTitles)
    .slice(0, 3)
    .map((candidate) => buildGuidedStepPayload(candidate, index, total, previousStep, objective, true));

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

function buildGuidedStepPayload(exercise, index, total, previousStep, objective, forAlternative = false) {
  const profile = buildProgressionProfile(exercise);
  const { setsTarget, repsTarget } = splitPrescription(exercise.prescription);
  const restSeconds = estimateRestSeconds(profile, objective);
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

function renderTodayPlanAlternativesView({ elements, currentStep, formatSuggestedWeightCompact, buildMachineActionSummary, escapeHtml }) {
  if (!elements.todayPlanAlternatives) {
    return;
  }

  if (!currentStep?.alternativeOptions?.length) {
    elements.todayPlanAlternatives.hidden = true;
    elements.todayPlanAlternatives.innerHTML = "";
    return;
  }

  elements.todayPlanAlternatives.hidden = false;
  elements.todayPlanAlternatives.innerHTML = currentStep.alternativeOptions.map((option, index) => `
    <button class="alt-swap-card alt-swap-card--gallery" type="button" data-alt-index="${index}">
      <div class="alt-swap-card__media">${buildAlternativeMediaMarkup(option, escapeHtml)}</div>
      <div class="alt-swap-card__body">
        <strong>${escapeHtml(option.title)}</strong>
        <span>${escapeHtml(buildMachineActionSummary(option, pickPrimaryMuscle(option.muscleGroups)))}</span>
        <span>${escapeHtml(option.prescription || formatSuggestedWeightCompact(option) || "Canvia aquestà màquina")}</span>
      </div>
    </button>
  `).join("");
}

function buildGuidedPlanAlternativeRail(step, helpers) {
  if (step.status === "done" || step.status === "skipped" || !step.alternativeOptions?.length) {
    return null;
  }

  const rail = document.createElement("div");
  rail.className = "machine-card__alternatives";
  rail.innerHTML = `
    <div class="machine-card__alternatives-label">Alternatives d'aquest pas</div>
    <div class="alt-swap-list alt-swap-list--embedded" data-guided-step-position="${step.position}">
      ${step.alternativeOptions.map((option, index) => `
        <button class="alt-swap-card alt-swap-card--gallery" type="button" data-guided-step-position="${step.position}" data-guided-alt-index="${index}">
          <div class="alt-swap-card__media">${buildAlternativeMediaMarkup(option, helpers.escapeHtml)}</div>
          <div class="alt-swap-card__body">
            <strong>${helpers.escapeHtml(option.title)}</strong>
            <span>${helpers.escapeHtml(helpers.buildMachineActionSummary(option, pickPrimaryMuscle(option.muscleGroups)))}</span>
            <span>${helpers.escapeHtml(option.prescription || helpers.formatSuggestedWeightCompact(option) || "Canvia aquestà màquina")}</span>
          </div>
        </button>
      `).join("")}
    </div>
  `;
  return rail;
}

function buildAlternativeMediaMarkup(option, escapeHtml) {
  const imageUrl = [option.heroImage, ...(option.imageUrls || [])].find(Boolean);
  if (imageUrl) {
    return `<img class="alt-swap-card__image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return buildFocusAvatarMarkup(option.muscleGroups || ["all"], pickPrimaryMuscle(option.muscleGroups || []), "accent");
}

function overlapScore(sourceExercise, sourceMuscles, candidate) {
  const sourceProfile = sourceExercise.movementFamily && sourceExercise.loadSystem
    ? { family: sourceExercise.movementFamily, loadSystem: sourceExercise.loadSystem }
    : buildProgressionProfile(sourceExercise);
  const candidateProfile = candidate.movementFamily && candidate.loadSystem
    ? { family: candidate.movementFamily, loadSystem: candidate.loadSystem }
    : buildProgressionProfile(candidate);
  let score = 0;
  candidate.muscleGroups.forEach((muscle) => {
    if (muscle !== "all" && sourceMuscles.has(muscle)) {
      score += 4;
    }
  });

  if (sourceExercise.equipmentType === candidate.equipmentType) {
    score += 2;
  }

  if (sourceProfile.family === candidateProfile.family) {
    score += 3;
  }

  if (sourceProfile.loadSystem === candidateProfile.loadSystem) {
    score += 1;
  }

  const candidateMuscles = candidate.muscleGroups || [];
  const samePrimary = pickPrimaryMuscle(sourceExercise.muscleGroups || []) === pickPrimaryMuscle(candidateMuscles);
  if (samePrimary) {
    score += 2;
  }

  return score;
}

function findUniqueGuidedReplacement(step, plan, recommendationPool, usedProductIds, usedTitles, blockedProductIds = new Set()) {
  const inlineOptions = (step.alternativeOptions || [])
    .map((option) => ({
      ...option,
      id: option.productId || option.id
    }));
  const recommendationOptions = pickAlternativeExercises(
    step,
    recommendationPool,
    new Set([...usedProductIds, step.productId || step.id, ...blockedProductIds]),
    new Set([...usedTitles, normalizeLookupText(step.title)])
  );

  return [...inlineOptions, ...recommendationOptions].find((candidate) => {
    const productKey = candidate.productId || candidate.id;
    const titleKey = normalizeLookupText(candidate.title);
    return (!productKey || (!usedProductIds.has(productKey) && !blockedProductIds.has(productKey)))
      && (!titleKey || !usedTitles.has(titleKey));
  }) || null;
}

function estimateRestSeconds(profile, objective) {
  if (objective === "strength") {
    return profile.growthPotential === "high" ? 105 : 75;
  }
  if (objective === "fat-loss" || objective === "quick") {
    return 35;
  }
  if (objective === "endurance") {
    return 30;
  }
  if (objective === "mobility" || objective === "recovery") {
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
