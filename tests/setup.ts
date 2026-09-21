import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Replace global indexedDB with fake implementation for tests
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
