import { CATALOG_PROVIDERS, CLIENT_SCHEMA_VERSION, ROUTINE_DAY_OPTIONS } from "./config.js";
import { inferLoadMetadata } from "./proportionality.js";
import { readMachinePrefs, readMeta, readProducts, readRoutineDays, readUsageEvents, writeMachinePref, writeMeta, writeProducts, writeRoutineDay, writeUsageEvent } from "./storage.js";

export async function runClientMigrations() {
  const current = await readMeta("client-schema-version");
  let version = current?.value || 0;

  while (version < CLIENT_SCHEMA_VERSION) {
    const next = version + 1;
    if (next === 1) {
      await migrateToVersion1();
    }
    if (next === 2) {
      await migrateToVersion2();
    }
    if (next === 3) {
      await migrateToVersion3();
    }
    if (next === 4) {
      await migrateToVersion4();
    }
    if (next === 5) {
      await migrateToVersion5();
    }
    version = next;
    await writeMeta({ key: "client-schema-version", value: version, migratedAt: new Date().toISOString() });
  }
}

async function migrateToVersion1() {
  const products = await readProducts();
  if (products.length > 0) {
    const provider = CATALOG_PROVIDERS[0];
    await writeProducts(products.map((product) => ({
      ...product,
      brand: product.brand || provider.label,
      providerId: product.providerId || provider.id,
      sourceUrl: product.sourceUrl || `${provider.baseUrl}/products/${product.handle}`
    })));
  }
}

async function migrateToVersion2() {
  const usageEvents = await readUsageEvents();
  for (const event of usageEvents) {
    await writeUsageEvent({
      objective: "hypertrophy",
      weightKg: null,
      ...event
    });
  }

  const prefs = await readMachinePrefs();
  for (const pref of prefs) {
    await writeMachinePref({
      brandScope: pref.brandScope || "all",
      ...pref
    });
  }
}

async function migrateToVersion3() {
  await writeMeta({
    key: "session-model-ready",
    value: true,
    updatedAt: new Date().toISOString()
  });
}

async function migrateToVersion4() {
  const existing = await readRoutineDays();
  if (existing.length > 0) {
    return;
  }

  for (const day of ROUTINE_DAY_OPTIONS) {
    await writeRoutineDay({
      id: day.id,
      label: day.label,
      entries: [],
      updatedAt: new Date().toISOString()
    });
  }
}

async function migrateToVersion5() {
  const products = await readProducts();
  if (products.length === 0) {
    return;
  }

  await writeProducts(products.map((product) => {
    const loadMeta = inferLoadMetadata(product);
    return {
      ...product,
      loadSystem: product.loadSystem || loadMeta.loadSystem,
      loadUnit: product.loadUnit || loadMeta.loadUnit,
      stepKg: typeof product.stepKg === "number" ? product.stepKg : loadMeta.stepKg,
      baseResistanceKg: typeof product.baseResistanceKg === "number" ? product.baseResistanceKg : loadMeta.baseResistanceKg,
      availablePlatesKg: Array.isArray(product.availablePlatesKg) && product.availablePlatesKg.length > 0
        ? product.availablePlatesKg
        : loadMeta.availablePlatesKg
    };
  }));
}
