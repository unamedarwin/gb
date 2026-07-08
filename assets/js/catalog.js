import { CATALOG_PROVIDERS } from "./config.js";
import { buildClassificationText, deriveMuscleGroups } from "./catalog-classification.js";
import { inferLoadMetadata } from "./proportionality.js";

const INSTRUCTION_SECTION_ORDER = ["configuration", "adjustments", "ergonomics", "exercise", "placard", "qr", "safety"];
const INSTRUCTION_SECTION_LABELS = {
  configuration: "Configuració",
  adjustments: "Ajustos",
  ergonomics: "Postura",
  exercise: "Treballa",
  placard: "Etiqueta",
  qr: "QR",
  safety: "Seguretat"
};

export async function fetchCatalogWithProgress(onProgress) {
  const merged = new Map();
  const providerEntries = CATALOG_PROVIDERS.flatMap((provider) => provider.collections.map((collection) => ({ provider, collection })));
  const total = providerEntries.length;
  let completed = 0;

  for (const entry of providerEntries) {
    const collectionProducts = await fetchCollectionProducts(entry.provider, entry.collection.handle);
    for (const rawProduct of collectionProducts) {
      const normalized = normalizeProduct(rawProduct, entry.provider, entry.collection);
      if (merged.has(normalized.id)) {
        const existing = merged.get(normalized.id);
        existing.collections = Array.from(new Set([...existing.collections, ...normalized.collections]));
        existing.collectionHandles = Array.from(new Set([...existing.collectionHandles, ...normalized.collectionHandles]));
        existing.imageUrls = Array.from(new Set([...existing.imageUrls, ...normalized.imageUrls]));
        existing.muscleGroups = Array.from(new Set([...existing.muscleGroups, ...normalized.muscleGroups]));
        existing.series = pickSeries(existing.series, normalized.series);
        existing.equipmentType = pickEquipmentType(existing.equipmentType, normalized.equipmentType);
        existing.loadSystem = pickLoadSystem(existing.loadSystem, normalized.loadSystem);
        existing.loadUnit = existing.loadUnit || normalized.loadUnit;
        existing.stepKg = Math.max(existing.stepKg || 0, normalized.stepKg || 0);
        existing.baseResistanceKg = Math.max(existing.baseResistanceKg || 0, normalized.baseResistanceKg || 0) || null;
        existing.availablePlatesKg = Array.from(new Set([...(existing.availablePlatesKg || []), ...(normalized.availablePlatesKg || [])])).sort((left, right) => left - right);
        existing.searchText = `${existing.searchText} ${normalized.searchText}`.trim();
      } else {
        merged.set(normalized.id, normalized);
      }
    }
    completed += 1;
    onProgress(completed, total, `${entry.provider.label} · ${entry.collection.label}`);
  }

  return Array.from(merged.values()).sort((left, right) => left.title.localeCompare(right.title, "ca"));
}

export async function fetchProductInstructionSheet(product, provider) {
  if (!product?.handle || !provider?.baseUrl) {
    throw new Error("No hi ha prou dades per carregar la fitxa d'instruccions.");
  }

  const response = await fetch(`${provider.baseUrl}/products/${product.handle}.js`);
  if (!response.ok) {
    throw new Error(`No s'ha pogut carregar la fitxa ${product.handle}`);
  }

  const payload = await response.json();
  const sections = extractInstructionSections(payload.description || "");

  return {
    title: payload.title?.trim() || product.title,
    sections
  };
}

async function fetchCollectionProducts(provider, handle) {
  const products = [];
  let page = 1;
  while (true) {
    const response = await fetch(`${provider.baseUrl}/collections/${handle}/products.json?limit=250&page=${page}`);
    if (!response.ok) {
      throw new Error(`No s'ha pogut carregar la col·leccio ${handle}`);
    }
    const payload = await response.json();
    products.push(...payload.products);
    if (payload.products.length < 250) {
      break;
    }
    page += 1;
  }
  return products;
}

function normalizeProduct(rawProduct, provider, collection) {
  const plainDescription = stripHtml(rawProduct.body_html || "");
  const tags = Array.isArray(rawProduct.tags)
    ? rawProduct.tags
    : String(rawProduct.tags || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
  const imageUrls = (rawProduct.images || [])
    .map((image) => image.src)
    .filter(Boolean)
    .map((url) => url.replace(/^http:\/\//i, "https://"));
  const title = rawProduct.title?.trim() || "Sense nom";
  const searchText = [title, plainDescription, rawProduct.handle, tags.join(" "), collection.label].join(" ").toLowerCase();
  const equipmentType = deriveEquipmentType(collection, searchText);
  const classificationText = buildClassificationText({
    title,
    handle: rawProduct.handle,
    tags,
    collectionLabel: collection.label,
    plainDescription,
    equipmentType
  });
  const muscleGroups = deriveMuscleGroups({ searchText: classificationText, family: collection.family });
  const loadMeta = inferLoadMetadata({
    title,
    handle: rawProduct.handle,
    searchText,
    collectionHandles: [collection.handle],
    equipmentType,
    muscleGroups
  });

  return {
    id: rawProduct.id,
    handle: rawProduct.handle,
    title,
    brand: provider.label,
    providerId: provider.id,
    description: summarizeDescription(plainDescription),
    collections: [collection.label],
    collectionHandles: [collection.handle],
    equipmentType,
    series: deriveSeries(collection, title),
    muscleGroups,
    loadSystem: loadMeta.loadSystem,
    loadUnit: loadMeta.loadUnit,
    stepKg: loadMeta.stepKg,
    baseResistanceKg: loadMeta.baseResistanceKg,
    availablePlatesKg: loadMeta.availablePlatesKg,
    imageUrls,
    heroImage: imageUrls[0] || "",
    searchText,
    sourceUrl: `${provider.baseUrl}/products/${rawProduct.handle}`,
    updatedAt: rawProduct.updated_at
  };
}

function deriveEquipmentType(collection, searchText) {
  if (collection.equipmentType !== "machine") {
    return collection.equipmentType;
  }
  if (searchText.includes("mancuerna") || searchText.includes("barra") || searchText.includes("disco")) {
    return "free-weight";
  }
  if (searchText.includes("banco") || searchText.includes("rack") || searchText.includes("jaula")) {
    return "support";
  }
  return "machine";
}

function deriveSeries(collection, title) {
  const series = ["Iron Force", "Master Coach", "Diamond", "Hela", "Frey", "Fast Line", "One", "Eros", "Aqua", "Aton"];
  return series.find((entry) => title.toLowerCase().includes(entry.toLowerCase())) || collection.label;
}

function summarizeDescription(text) {
  if (!text) {
    return "Fitxa disponible des del catàleg públic d'F&H Fitness.";
  }
  return text.length > 160 ? `${text.slice(0, 157).trim()}...` : text;
}

function extractInstructionSections(html) {
  const sections = parseDescriptionSections(html);
  const selected = [];
  const seen = new Set();

  for (const section of sections) {
    const sectionId = detectInstructionSection(section.title);
    if (!sectionId || seen.has(sectionId)) {
      continue;
    }

    const summary = summarizeInstructionText(section.content);
    if (!summary) {
      continue;
    }

    seen.add(sectionId);
    selected.push({
      id: sectionId,
      label: INSTRUCTION_SECTION_LABELS[sectionId],
      content: summary
    });
  }

  if (selected.length > 0) {
    return selected.sort((left, right) => INSTRUCTION_SECTION_ORDER.indexOf(left.id) - INSTRUCTION_SECTION_ORDER.indexOf(right.id));
  }

  return sections
    .filter((section) => section.content)
    .slice(0, 4)
    .map((section, index) => ({
      id: `fallback-${index}`,
      label: sanitizeSectionLabel(section.title || `Bloc ${index + 1}`),
      content: summarizeInstructionText(section.content)
    }))
    .filter((section) => section.content);
}

function parseDescriptionSections(html) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = documentNode.body.firstElementChild || documentNode.body;
  const sections = [];
  let current = null;

  for (const block of root.children) {
    const descriptor = describeBlock(block);
    if (!descriptor.title && !descriptor.body) {
      continue;
    }

    if (descriptor.title) {
      if (current?.title || current?.content) {
        sections.push(current);
      }
      current = {
        title: descriptor.title,
        content: descriptor.body
      };
      continue;
    }

    if (!current) {
      current = { title: "Indicacions", content: descriptor.body };
      continue;
    }

    current.content = [current.content, descriptor.body].filter(Boolean).join(" ").trim();
  }

  if (current?.title || current?.content) {
    sections.push(current);
  }

  return sections;
}

function describeBlock(block) {
  const text = normalizeText(block.textContent || "");
  if (!text) {
    return { title: "", body: "" };
  }

  const headingCandidate = normalizeText(block.querySelector("strong")?.textContent || "");
  if (headingCandidate) {
    if (text === headingCandidate) {
      return { title: headingCandidate, body: "" };
    }

    if (text.startsWith(headingCandidate)) {
      return {
        title: headingCandidate,
        body: text.slice(headingCandidate.length).replace(/^[:.\-\s]+/, "").trim()
      };
    }
  }

  if (looksLikeStandaloneHeading(text)) {
    return { title: text, body: "" };
  }

  return { title: "", body: text };
}

function looksLikeStandaloneHeading(text) {
  if (!text || text.length > 36) {
    return false;
  }

  const compact = text.replace(/[.:]/g, "").trim();
  return compact === compact.toUpperCase();
}

function detectInstructionSection(title) {
  const comparable = normalizeComparable(title);
  if (!comparable) {
    return "";
  }
  if (/(configuración|configuración|configuració)/.test(comparable)) {
    return "configuration";
  }
  if (/(ajustes|ajuste|regulacion|regulable)/.test(comparable)) {
    return "adjustments";
  }
  if (/(ergonomia|postura|angulo de trabajo)/.test(comparable)) {
    return "ergonomics";
  }
  if (/(caracteristicas|ejercicio|grupo múscular)/.test(comparable)) {
    return "exercise";
  }
  if (/(pictograma|etiqueta)/.test(comparable)) {
    return "placard";
  }
  if (/(codigo qr|qr|manual)/.test(comparable)) {
    return "qr";
  }
  if (/(seguridad|bloqueo de seguridad)/.test(comparable)) {
    return "safety";
  }
  return "";
}

function summarizeInstructionText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const selected = [];
  let total = 0;

  for (const sentence of sentences) {
    const nextLength = total + sentence.length;
    if (selected.length >= 2 || (selected.length > 0 && nextLength > 240)) {
      break;
    }
    selected.push(sentence);
    total = nextLength;
  }

  const summary = (selected.join(" ") || normalized).trim();
  return summary.length > 240 ? `${summary.slice(0, 237).trim()}...` : summary;
}

function sanitizeSectionLabel(value) {
  const text = normalizeText(value);
  if (!text) {
    return "Bloc";
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function stripHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent?.replace(/\s+/g, " ").trim() || "";
}

function normalizeComparable(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSeries(current, next) {
  return current && current !== "Musculació" ? current : next;
}

function pickEquipmentType(current, next) {
  if (current === next) {
    return current;
  }
  if (current === "free-weight" || next === "free-weight") {
    return "free-weight";
  }
  if (current === "machine" || next === "machine") {
    return "machine";
  }
  return next;
}

function pickLoadSystem(current, next) {
  const priority = ["plate_loaded", "stack", "free_weight", "support", "bodyweight", "custom"];
  const currentIndex = priority.indexOf(current);
  const nextIndex = priority.indexOf(next);
  if (currentIndex === -1) {
    return next;
  }
  if (nextIndex === -1) {
    return current;
  }
  return currentIndex <= nextIndex ? current : next;
}
