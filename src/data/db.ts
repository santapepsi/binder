// Minimal promise wrapper over IndexedDB. Binders, card copies, cached images
// and small settings all live here, so everything works offline.

const NAME = "binder";
const VERSION = 1;

export type StoreName = "binders" | "cards" | "images" | "meta";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("binders")) db.createObjectStore("binders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cards")) {
        db.createObjectStore("cards", { keyPath: "id" }).createIndex("binderId", "binderId");
      }
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

/** Writes several values in one transaction. Out-of-line stores need keys. */
export async function put(store: StoreName, values: unknown[], keys?: IDBValidKey[]): Promise<void> {
  if (!values.length) return;
  const db = await open();
  const transaction = db.transaction(store, "readwrite");
  const objects = transaction.objectStore(store);
  values.forEach((value, index) => objects.put(value, keys?.[index]));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await open();
  await done(db.transaction(store, "readwrite").objectStore(store).delete(key));
}
