/**
 * The page's browser-eviction protection state.
 *
 * One instance belongs to one page lifetime, beside the library and the
 * download attempts. The page asks the browser for persistent storage once,
 * after the library first becomes ready, and this owner keeps the answer. It is
 * page-scope on purpose: the Backup section mounts and unmounts with the
 * library's status, and a remount must not ask again.
 *
 * The request never blocks the page and nothing announces it at start-up. The
 * four answers are shown in the Backup section, and a person can ask again.
 *
 * It is advisory. A denial, a browser that does not report protection, or a
 * failed check changes nothing about Backup, Restore, or normal use: no caller
 * may make either operation depend on this state.
 */

/** What the browser answered. `unchecked` is not an answer: nothing asked yet. */
export type ProtectionState = 'unchecked' | 'protected' | 'not-protected' | 'unsupported' | 'failed';

export interface PersistentStorageDeps {
  /** Reports whether this origin is already protected. Absent = the browser has no such API. */
  persisted?: (() => Promise<boolean>) | undefined;
  /** Asks the browser to protect this origin. Absent = the browser has no such API. */
  persist?: (() => Promise<boolean>) | undefined;
  logger?: Pick<Console, 'warn' | 'error'>;
}

/**
 * The browser's own storage manager seams. Resolved at construction, so an
 * absent API reads as "not reported" instead of throwing when it is asked.
 */
function browserSeams(): Pick<PersistentStorageDeps, 'persisted' | 'persist'> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage || typeof storage.persisted !== 'function' || typeof storage.persist !== 'function') {
    return {};
  }
  return {
    persisted: () => storage.persisted(),
    persist: () => storage.persist(),
  };
}

/** One line per answer, in words a person can act on. */
const REPORTED: Record<Exclude<ProtectionState, 'unchecked'>, string> = {
  protected:
    "Your browser has protected this site's storage, so it will not clear your library to free up space.",
  'not-protected':
    "This browser has not protected this site's storage, so it may clear your library to free up space. Create a Backup to keep a copy.",
  unsupported:
    'This browser does not report storage protection, so the app cannot tell whether your library is protected. Create a Backup to keep a copy.',
  failed:
    'The check for protected storage did not finish, so the app cannot tell whether your library is protected. Try again, and create a Backup to keep a copy.',
};

export class PersistentStorage {
  readonly #persisted: (() => Promise<boolean>) | undefined;
  readonly #persist: (() => Promise<boolean>) | undefined;
  readonly #logger: Pick<Console, 'warn' | 'error'>;

  /** The page lifetime's one ask has been spent, whatever its outcome. */
  #requested = false;
  #state = $state<ProtectionState>('unchecked');
  #pending = $state(false);

  constructor(deps: PersistentStorageDeps = {}) {
    const seams = browserSeams();
    // A seam passed as `undefined` means the browser does not report it, so the
    // key's presence decides, not its value.
    this.#persisted = 'persisted' in deps ? deps.persisted : seams.persisted;
    this.#persist = 'persist' in deps ? deps.persist : seams.persist;
    this.#logger = deps.logger ?? console;
  }

  get state(): ProtectionState {
    return this.#state;
  }

  get pending(): boolean {
    return this.#pending;
  }

  get message(): string {
    return this.#state === 'unchecked' ? '' : REPORTED[this.#state];
  }

  /**
   * Whether asking again could change anything. A browser that does not report
   * protection cannot be asked, and an origin that is already protected has
   * nothing left to request.
   */
  get canRetry(): boolean {
    return this.#state === 'not-protected' || this.#state === 'failed';
  }

  /**
   * Spend the page lifetime's one request. Calling it again — from a React-like
   * re-run, or from the next mount of the section — does nothing.
   */
  requestOnce(): void {
    if (this.#requested) return;
    this.#requested = true;
    void this.#askAndApply();
  }

  /** One user-initiated request. A call while one is pending adds nothing. */
  retry(): void {
    void this.#askAndApply();
  }

  async #askAndApply(): Promise<void> {
    if (this.#pending) return;
    this.#pending = true;
    try {
      this.#state = await this.#ask();
    } finally {
      this.#pending = false;
    }
  }

  /** Ask the browser for its answer. Never rejects: a failure is an answer too. */
  async #ask(): Promise<ProtectionState> {
    const persisted = this.#persisted;
    if (!persisted) return 'unsupported';

    try {
      if (await persisted()) return 'protected';
      const persist = this.#persist;
      if (!persist) return 'unsupported';
      return (await persist()) ? 'protected' : 'not-protected';
    } catch (error) {
      this.#logger.warn('Could not check browser storage protection:', error);
      return 'failed';
    }
  }
}
