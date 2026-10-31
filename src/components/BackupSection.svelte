<script lang="ts">
  import type { CharacterLibrary } from '../character-library.svelte';
  import {
    BACKUP_MIME_TYPE,
    BackupFileError,
    backupFileName,
    backupParts,
    parseBackup,
    type UnreadableRecord,
  } from '../backup-format';
  import { planRestore, type RestoreCounts } from '../character-library.svelte';
  import { downloadBlob } from '../download';
  import { PersistentStorage } from '../persistent-storage.svelte';
  import StorageProtection from './StorageProtection.svelte';

  /** One flag owns the section's busy state, so Backup and Restore exclude each other. */
  type Operation = 'backup' | 'restore';

  const SECTION_HEADING = 'Backup and restore';
  const BACKUP_PREPARING = 'Preparing your Backup…';
  const BACKUP_BUSY_REASON = 'A Backup is in progress.';
  const EMPTY_REASON = 'There are no Characters to back up yet.';
  const BACKUP_FAILED =
    'The Backup could not be created, so nothing was downloaded. Your library is unchanged.';
  const RESTORE_READING = 'Reading and checking the Backup file…';
  const RESTORE_BUSY_REASON = 'A Restore is in progress.';
  const RESTORE_FAILED =
    'The Characters could not be restored, so nothing was written. Your library is unchanged.';
  const RESTORE_CANCELED = 'Restore canceled. Nothing was written.';
  const handoff = (fileName: string) =>
    `Backup handed to your browser for download as ${fileName}. ` +
    'Your browser or operating system chooses where it saves it.';

  /** How much of a file each read returns, so no one string spans the library. */
  const FILE_CHUNK_SIZE = 1 << 20;

  /**
   * Read a selected file as text chunks. A streaming File would also work, but
   * chunked slices keep the same path in a browser and in the test environment.
   */
  async function* readFileChunks(file: File): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    for (let offset = 0; offset < file.size; offset += FILE_CHUNK_SIZE) {
      const bytes = await file.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer();
      const text = decoder.decode(bytes, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  }

  // The page owns the browser-protection state, so the once-per-page-lifetime
  // request survives this section unmounting and mounting again. A section
  // mounted on its own still renders: its fresh owner has no answer yet.
  let {
    library,
    readFile = readFileChunks,
    protection = new PersistentStorage(),
  }: {
    library: CharacterLibrary;
    /** The file-read seam, so a test can hold a read open or feed chunks. */
    readFile?: (file: File) => AsyncIterable<string>;
    protection?: PersistentStorage;
  } = $props();

  let operation = $state<Operation | null>(null);
  let failureMessage = $state<string | null>(null);
  let statusMessage = $state('');

  const busy = $derived(operation !== null);
  const empty = $derived(library.characters.length === 0);

  const busyReason = $derived(
    operation === 'backup'
      ? BACKUP_BUSY_REASON
      : operation === 'restore'
        ? RESTORE_BUSY_REASON
        : null
  );
  const disabled = $derived(busy || empty);
  const reason = $derived(busy ? busyReason : empty ? EMPTY_REASON : null);
  const restoreDisabled = $derived(busy || library.status !== 'ready');

  /** One count in words, with the noun pluralized when it needs to be. */
  const countSentence = (noun: string, total: number) =>
    `${total} ${noun}${total === 1 ? '' : 's'}`;

  /**
   * Every record the file did not yield, named by its line and what it failed
   * on, so a damaged file is never reported as a count without the details.
   */
  const unreadableReport = (unreadable: readonly UnreadableRecord[]) =>
    unreadable.length === 0
      ? ''
      : ` ${countSentence('record', unreadable.length)} could not be read and ` +
        `${unreadable.length === 1 ? 'was' : 'were'} skipped: ` +
        `${unreadable
          .map((entry) => `line ${entry.line}: ${entry.reason}`)
          .join('; ')}.`;

  /** One native confirmation, stating exactly what the write would do. */
  const restoreConfirmation = (
    counts: RestoreCounts,
    unreadable: readonly UnreadableRecord[]
  ) =>
    'Restore this Backup?\n' +
    `${countSentence('Character', counts.added)} will be added.\n` +
    `${countSentence('Character', counts.skipped)} already in your library will be kept.\n` +
    `${countSentence('record', unreadable.length)} could not be read and will be skipped.`;

  /** The one sentence a finished Restore leaves, whether it wrote or not. */
  const restoreResult = (
    lead: string,
    counts: RestoreCounts,
    unreadable: readonly UnreadableRecord[]
  ) =>
    `${lead}: ${counts.added} added, ${counts.skipped} already in your library and kept.` +
    unreadableReport(unreadable);

  /**
   * The input is used directly, so its handler is the whole Restore. The input
   * is reset after every attempt, which is what lets the same file be chosen
   * again after a cancel.
   */
  async function handleRestoreFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      await startRestore(file);
    } finally {
      input.value = '';
    }
  }

  async function startRestore(file: File) {
    if (library.status !== 'ready' || busy) return;

    operation = 'restore';
    failureMessage = null;
    statusMessage = RESTORE_READING;

    try {
      // Read and validate the whole file first: a structural failure must
      // reject it before anything is counted or written.
      const parsed = await parseBackup(readFile(file));

      // Counts are taken from the list as it stands after accepted mutations
      // settle. The library applies the same rule again on its own chain, so
      // this preview never decides what is written.
      await library.settled();
      const preview = planRestore(parsed.records, library.characters);

      if (preview.counts.added === 0) {
        // Nothing would change, so nothing is written and nothing is asked.
        statusMessage = restoreResult('Nothing was written', preview.counts, parsed.unreadable);
        return;
      }

      if (!confirm(restoreConfirmation(preview.counts, parsed.unreadable))) {
        statusMessage = RESTORE_CANCELED;
        return;
      }

      const applied = await library.restore(parsed.records);
      statusMessage = restoreResult('Restore finished', applied, parsed.unreadable);
    } catch (error) {
      console.error('Failed to restore a Backup:', error);
      failureMessage =
        error instanceof BackupFileError ? error.message : RESTORE_FAILED;
      statusMessage = '';
    } finally {
      operation = null;
    }
  }

  async function startBackup() {
    // The page mounts this section only while the library is ready. The guard
    // keeps a call that arrives before the list is usable, or while another
    // operation runs, from starting a second one.
    if (library.status !== 'ready' || busy || empty) return;

    operation = 'backup';
    failureMessage = null;
    statusMessage = BACKUP_PREPARING;

    try {
      // Accepted saves and deletes commit first, so the file cannot miss a
      // Character the user just saved.
      await library.settled();

      // Give the page one task boundary so the busy status is committed before
      // serializing the library occupies the main thread. Without it a Backup
      // with nothing pending would build the whole file before the status could
      // be shown.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const exportedAt = new Date();
      // A transient snapshot for this one file. The library stays the only
      // owner of the canonical list.
      const parts = backupParts([...library.characters], exportedAt);
      const fileName = backupFileName(exportedAt);
      downloadBlob(new Blob(parts, { type: BACKUP_MIME_TYPE }), fileName);

      // A handoff is all the page can observe: the browser or the operating
      // system decides whether and where the file is saved.
      statusMessage = handoff(fileName);
    } catch (error) {
      console.error('Failed to create a Backup:', error);
      failureMessage = BACKUP_FAILED;
      statusMessage = '';
    } finally {
      operation = null;
    }
  }
</script>

<!--
  The Backup area below the Gallery. Its feedback lives here, so it never
  competes with the page's download or delete notices. Nothing focuses: busy and
  success are polite status, and a failure is an inline alert.
-->
<section
  aria-labelledby="backup-heading"
  aria-busy={busy}
  class="mt-10 rounded-xl border border-border bg-bg-secondary p-6"
>
  <h2 id="backup-heading" class="text-accent text-lg font-bold">{SECTION_HEADING}</h2>
  <p class="mt-1 text-sm text-zinc-400">
    A Backup is one file that carries every Character in your library, so you can restore it later
    or on another browser.
  </p>

  <div class="mt-4 flex flex-wrap items-center gap-3">
    <button
      type="button"
      onclick={startBackup}
      disabled={disabled}
      aria-describedby={reason ? 'backup-reason' : undefined}
      class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-transform motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-accent"
    >
      Create Backup
    </button>
    {#if reason}
      <p id="backup-reason" class="text-sm text-zinc-400">{reason}</p>
    {/if}
  </div>

  <!-- A native file input, used directly: its visible label is the control, so
       no hidden input and no browse button stand between the user and the
       browser's own file chooser. -->
  <div class="mt-6 border-t border-border pt-4">
    <h3 class="text-base font-semibold text-zinc-200">Restore</h3>
    <p class="mt-1 text-sm text-zinc-400">
      Choose a Backup file to add the Characters it carries. Characters already in your library are
      kept.
    </p>
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <label for="restore-file" class="text-sm font-medium text-zinc-200">Backup file</label>
      <input
        id="restore-file"
        type="file"
        accept=".jsonl,application/x-ndjson"
        disabled={restoreDisabled}
        aria-describedby={busy ? 'restore-reason' : undefined}
        onchange={handleRestoreFile}
        class="rounded-lg border border-zinc-500 bg-bg-secondary px-3 py-1.5 text-sm text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {#if busy}
        <p id="restore-reason" class="text-sm text-zinc-400">{busyReason}</p>
      {/if}
    </div>
  </div>

  {#if failureMessage}
    <p role="alert" class="mt-4 text-sm text-danger">{failureMessage}</p>
  {/if}

  <!-- Rendered empty from the start, because an assistive technology only
       announces a change to a live region that already existed. -->
  <p role="status" aria-live="polite" aria-atomic="true" class="mt-3 text-sm text-zinc-300">
    {statusMessage}
  </p>

  <!-- Last in the section, with its own polite line, so the storage answer
       never competes with the Backup feedback above it. -->
  <StorageProtection {protection} />
</section>
