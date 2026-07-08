import { normalizeLookupText } from "./logging-catalog.js";
import { buildFocusAvatarMarkup, buildMuscleAvatarMarkup, labelForMuscle, pickPrimaryMuscle } from "./muscle-ui.js";

export function buildMachineCardFragment(product, options, ctx) {
  const fragment = ctx.cardTemplate.content.cloneNode(true);
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
  hydrateCardGallery({ gallery, galleryDots, galleryPrev, galleryNext, product, escapeHtml: ctx.escapeHtml });
  type.textContent = labelForEquipmentType(product.equipmentType);
  series.textContent = product.series || "";
  title.textContent = product.title;
  const primaryMuscle = pickPrimaryMuscle(product.muscleGroups);
  focusLabel.textContent = buildMachineActionSummary(product, primaryMuscle);
  cue.textContent = buildMachineCue(product, primaryMuscle);
  muscleMap.innerHTML = buildMuscleAvatarMarkup(primaryMuscle, product.muscleGroups || []);
  muscleMap.setAttribute("aria-label", `Múscul principal ${labelForMuscle(primaryMuscle)}`);
  description.textContent = buildCardDescription(product, options, primaryMuscle, ctx);
  link.hidden = !product.sourceUrl;
  if (product.sourceUrl) {
    link.href = product.sourceUrl;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      ctx.openMachineSheet(product);
    });
  } else {
    link.removeAttribute("href");
  }
  toggle.textContent = options.hiddenMode ? "Recupera" : "No hi és";
  toggle.hidden = !canToggleAvailability || readOnly;
  logButton.hidden = options.hiddenMode || readOnly;
  logButton.textContent = ctx.hasActiveSession ? "Afegeix a sessió" : "Feta avui";

  if (canToggleAvailability && !readOnly) {
    toggle.addEventListener("click", () => ctx.toggleMachine(product.id, options.hiddenMode));
  }
  if (!readOnly) {
    logButton.addEventListener("click", () => ctx.logUsage(product));
  }

  for (const muscle of product.muscleGroups.slice(0, 4)) {
    muscles.append(buildTag(labelForMuscle(muscle)));
  }

  for (const collection of product.collections.slice(0, 3)) {
    collections.append(buildTag(collection));
  }

  return fragment;
}

export function renderMachineSheetView(elements, product, sheet, escapeHtml) {
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
        <p class="sheet-placard__caption">Fragment extret de la fitxa pública d'F&amp;H per ensenyar només la part operativa.</p>
      </div>
      <div class="tag-row sheet-placard__tags">
        <span class="tag">${escapeHtml(labelForEquipmentType(product.equipmentType))}</span>
        ${muscleTags}
      </div>
      <div class="sheet-placard__grid">
        ${sections || `<article class="sheet-placard__section"><h4>Fitxa</h4><p>No hem pogut resumir cap instrucció concreta en aquestà màquina.</p></article>`}
      </div>
    </section>
  `;
}

export function renderMachineSheetErrorView(elements, product, escapeHtml) {
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

export function supportsAvailabilityToggle(product) {
  return Boolean(product.providerId && product.providerId !== "bodyweight");
}

export function labelForEquipmentType(type) {
  if (type === "machine") {
    return "Màquina";
  }
  if (type === "free-weight") {
    return "Pes lliure";
  }
  if (type === "bodyweight") {
    return "Sense màquines";
  }
  if (type === "custom") {
    return "Pla propi";
  }
  return "Suport";
}

export function buildMachineActionSummary(product, primaryMuscle) {
  const normalized = normalizeLookupText(`${product.title} ${product.handle || ""} ${(product.collections || []).join(" ")}`);
  const action = inferMachineAction(normalized, primaryMuscle, product.equipmentType);
  return `${action} / ${labelForMuscle(primaryMuscle)}`;
}

function hydrateCardGallery({ gallery, galleryDots, galleryPrev, galleryNext, product, escapeHtml }) {
  const imageUrls = Array.from(new Set([...(product.imageUrls || []), product.heroImage].filter(Boolean)));
  if (product.equipmentType === "bodyweight" || imageUrls.length === 0) {
    gallery.innerHTML = `
      <div class="machine-card__placeholder machine-card__placeholder--${escapeHtml(product.equipmentType || "support")}">
        <div class="machine-card__placeholder-copy">
          <span class="signal-card__label">${escapeHtml(labelForEquipmentType(product.equipmentType))}</span>
          <strong>${escapeHtml(product.title)}</strong>
          <span>${escapeHtml(buildMachineActionSummary(product, pickPrimaryMuscle(product.muscleGroups || [])))}</span>
        </div>
        <div class="machine-card__placeholder-visual">
          ${buildFocusAvatarMarkup(product.muscleGroups || ["all"], pickPrimaryMuscle(product.muscleGroups || []), "accent")}
        </div>
      </div>
    `;
    galleryDots.hidden = true;
    galleryPrev.hidden = true;
    galleryNext.hidden = true;
    galleryDots.innerHTML = "";
    return;
  }

  const slides = imageUrls;

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

function buildMachineCue(product, primaryMuscle) {
  const normalized = normalizeLookupText(`${product.title} ${product.handle || ""}`);
  if (product.equipmentType === "bodyweight") {
    return "Controla el rang, mantingues tècnica neta i evita l'impuls.";
  }
  if (normalized.includes("press") || normalized.includes("bench") || normalized.includes("pec")) {
    return "Ajusta el seient i empeny amb recorregut controlat.";
  }
  if (normalized.includes("row") || normalized.includes("remo") || normalized.includes("pulldown") || normalized.includes("lat")) {
    return "Pit obert, traccióna cap a tu i controla la tornada.";
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
    return "Exercici sense màquina";
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
  return primaryMuscle === "all" ? "Màquina guiada" : `Treball de ${labelForMuscle(primaryMuscle).toLowerCase()}`;
}

function buildCardDescription(product, options, primaryMuscle, ctx) {
  const detailParts = options.showPrescription
    ? [
        product.prescription || "",
        ctx.formatSuggestedWeightCompact(product),
        product.progressionHint ? ctx.trimSentence(product.progressionHint, 56) : ""
      ]
    : [
        buildSecondaryMuscleSummary(product.muscleGroups, primaryMuscle),
        ctx.formatLastWeightCompact(product.id)
      ];

  const detail = detailParts.filter(Boolean).join(" - ");
  if (detail) {
    return detail;
  }
  if (options.showPrescription) {
    return buildSecondaryMuscleSummary(product.muscleGroups, primaryMuscle) || "Ajusta pes i manten tècnica neta.";
  }
  return ctx.trimSentence(product.description, 96) || `Treball principal ${labelForMuscle(primaryMuscle).toLowerCase()}.`;
}

function buildSecondaryMuscleSummary(muscleGroups, primaryMuscle) {
  const secondary = (muscleGroups || [])
    .filter((muscle) => muscle !== primaryMuscle && muscle !== "all")
    .slice(0, 2)
    .map((muscle) => labelForMuscle(muscle).toLowerCase());
  return secondary.length ? `Suport ${secondary.join(" + ")}` : "";
}

function buildTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}
