import { downloadCharacterImage } from './download';
import type { Character } from './types';

/**
 * The page's image-download attempts and the one failure notice they produce.
 *
 * One instance belongs to one page lifetime, so work that is still in flight
 * survives the Gallery being torn down — for example when a Character form
 * opens — and its failure can still reach the page.
 *
 * A rejected attempt is a detected preparation failure. A resolved attempt is
 * only a handoff to the browser, which does not prove the file was saved, so it
 * is never shown as a success.
 */

/** The Character whose attempt failed, captured when the attempt started. */
export interface DownloadNotice {
  characterId: string;
  characterName: string;
}

function failureMessage(name: string): string {
  return `Could not download the image for ${name}. Try Download again.`;
}

export class DownloadAttempts {
  /** Attempts started so far, per initiating Character. */
  #started = new Map<string, number>();
  /**
   * The newest attempt per Character whose outcome has been applied. It keeps
   * completion order from deciding the notice: an attempt that settles after a
   * newer one for the same Character is stale, whatever its outcome.
   */
  #applied = new Map<string, number>();
  #notice = $state<DownloadNotice | null>(null);

  /** The failure the page should show, or null when there is nothing to report. */
  get notice(): DownloadNotice | null {
    return this.#notice;
  }

  /** The notice as one sentence, or null when there is no notice. */
  get message(): string | null {
    return this.#notice === null ? null : failureMessage(this.#notice.characterName);
  }

  /**
   * Start an attempt for `character`. The Character's identity and name are
   * captured now, so a later rename, edit, or navigation cannot re-attribute
   * the outcome.
   */
  start(character: Character): void {
    const attempt = (this.#started.get(character.id) ?? 0) + 1;
    this.#started.set(character.id, attempt);

    const notice: DownloadNotice = {
      characterId: character.id,
      characterName: character.name,
    };

    void downloadCharacterImage(character).then(
      () => this.#handedOff(attempt, notice),
      (error) => this.#failed(attempt, notice, error)
    );
  }

  /** Remove the notice. The user can still retry with the Download action. */
  dismiss(): void {
    this.#notice = null;
  }

  /**
   * Apply a failure: it is logged as the detected failure it is, and it becomes
   * the one notice. An attempt that settles after a newer one for the same
   * Character is stale and changes nothing. Different Characters are ordered
   * independently, so their outcomes are never treated as interchangeable.
   */
  #failed(attempt: number, notice: DownloadNotice, error: unknown): void {
    console.error('Download failed:', error);
    if (attempt <= (this.#applied.get(notice.characterId) ?? 0)) return;
    this.#applied.set(notice.characterId, attempt);
    this.#notice = notice;
  }

  /**
   * Apply a handoff, under the same per-Character ordering as a failure. It is
   * not proof the file was saved, but it does resolve this Character's pending
   * feedback; another Character's notice is left alone.
   */
  #handedOff(attempt: number, notice: DownloadNotice): void {
    if (attempt <= (this.#applied.get(notice.characterId) ?? 0)) return;
    this.#applied.set(notice.characterId, attempt);
    if (this.#notice?.characterId === notice.characterId) {
      this.#notice = null;
    }
  }
}
