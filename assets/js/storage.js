import { CUSTOM_EXERCISE_STORE, DB_NAME, DB_VERSION, META_STORE, PREF_STORE, PRODUCT_STORE, ROUTINE_DAY_STORE, SESSION_STORE, USAGE_STORE } from "./config.js";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
        db.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(PREF_STORE)) {
        db.createObjectStore(PREF_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(USAGE_STORE)) {
        db.createObjectStore(USAGE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CUSTOM_EXERCISE_STORE)) {
        db.createObjectStore(CUSTOM_EXERCISE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ROUTINE_DAY_STORE)) {
        db.createObjectStore(ROUTINE_DAY_STORE, { keyPath: "id" });
      }
    };
  });
}

async function getAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putOne(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function putMany(storeValues) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeValues.map((entry) => entry.storeName), "readwrite");
    storeValues.forEach(({ storeName, value }) => {
      transaction.objectStore(storeName).put(value);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function replaceAll(storeName, values) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const value of values) {
      store.put(value);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteOne(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getOne(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export const readProducts = () => getAll(PRODUCT_STORE);
export const writeProducts = (products) => replaceAll(PRODUCT_STORE, products);
export const readMeta = (key) => getOne(META_STORE, key);
export const writeMeta = (value) => putOne(META_STORE, value);
export const readMachinePrefs = () => getAll(PREF_STORE);
export const writeMachinePref = (value) => putOne(PREF_STORE, value);
export const readUsageEvents = () => getAll(USAGE_STORE);
export const writeUsageEvent = (value) => putOne(USAGE_STORE, value);
export const readSessions = () => getAll(SESSION_STORE);
export const readSession = (id) => getOne(SESSION_STORE, id);
export const writeSession = (value) => putOne(SESSION_STORE, value);
export const writeUsageEventAndSession = (usageEvent, session) => putMany([
  { storeName: USAGE_STORE, value: usageEvent },
  { storeName: SESSION_STORE, value: session }
]);
export async function replaceSessionUsageEvents(session, usageEvents) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE, USAGE_STORE], "readwrite");
    const sessionStore = transaction.objectStore(SESSION_STORE);
    const usageStore = transaction.objectStore(USAGE_STORE);

    sessionStore.put(session);
    const cursorRequest = usageStore.openCursor();
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        usageEvents.forEach((event) => usageStore.put(event));
        return;
      }
      if (cursor.value?.sessionId === session.id) {
        cursor.delete();
      }
      cursor.continue();
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function deleteSessionCascade(sessionId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE, USAGE_STORE], "readwrite");
    const sessionStore = transaction.objectStore(SESSION_STORE);
    const usageStore = transaction.objectStore(USAGE_STORE);

    sessionStore.delete(sessionId);
    const cursorRequest = usageStore.openCursor();
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }
      if (cursor.value?.sessionId === sessionId) {
        cursor.delete();
      }
      cursor.continue();
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export const readCustomExercises = () => getAll(CUSTOM_EXERCISE_STORE);
export const writeCustomExercise = (value) => putOne(CUSTOM_EXERCISE_STORE, value);
export const readRoutineDays = () => getAll(ROUTINE_DAY_STORE);
export const writeRoutineDay = (value) => putOne(ROUTINE_DAY_STORE, value);
