// Remembers which invitation this device verified for, via the hidden device
// code the backend hands back after a successful surname + last-4 check.
// Stored in localStorage (key "rr.k"); if storage is unavailable (some private
// modes) it falls back to memory, so the guest only re-verifies on a later visit.

export const STORAGE_KEY = 'rr.k';
export const CODE_PATTERN = /^[A-Za-z0-9]{12}$/;

export function isValidCode(value) {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

/** @param {() => Storage} getStorage  may throw (blocked storage) */
export function createAccess(getStorage = () => globalThis.localStorage) {
  let memory = null;

  return {
    /** The remembered code, or null. */
    get() {
      try {
        const stored = getStorage().getItem(STORAGE_KEY);
        return isValidCode(stored) ? stored : null;
      } catch {
        return memory;
      }
    },
    /** Remember a code (ignored if it isn't a well-formed code). */
    set(code) {
      if (!isValidCode(code)) return;
      memory = code;
      try {
        getStorage().setItem(STORAGE_KEY, code);
      } catch {
        // memory only
      }
    },
    /** Forget the remembered code ("Not you?", revoked, or unknown). */
    forget() {
      memory = null;
      try {
        getStorage().removeItem(STORAGE_KEY);
      } catch {
        // nothing stored
      }
    },
  };
}

export const access = createAccess();
