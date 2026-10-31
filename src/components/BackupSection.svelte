<script lang="ts">
  import type { CharacterLibrary } from '../character-library.svelte';
  import { BACKUP_MIME_TYPE, backupFileName, backupParts } from '../backup-format';
  import { downloadBlob } from '../download';

  /**
   * A Backup or a Restore. This slice only runs a Backup, but one flag owns the
   * section's busy state so a Restore can join it without a second source.
   */
  type Operation = 'backup' | 'restore';

  const SECTION_HEADING = 'Backup and restore';
  const BACKUP_PREPARING = 'Preparing your Backup…';
  const BACKUP_BUSY_REASON = 'A Backup is in progress.';
  const EMPTY_REASON = 'There are no Characters to back up yet.';
  const BACKUP_FAILED =
    'The Backup could not be created, so nothing was downloaded. Your library is unchanged.';
  const handoff = (fileName: string) =>
    `Backup handed to your browser for download as ${fileName}. ` +
    'Your browser or operating system chooses where it saves it.';

  let { library }: { library: CharacterLibrary } = $props();

  let operation = $state<Operation | null>(null);
  let failureMessage = $state<string | null>(null);
  let statusMessage = $state('');

  const busy = $derived(operation !== null);
  const empty = $derived(library.characters.length === 0);
  const disabled = $derived(busy || empty);
  const reason = $derived(busy ? BACKUP_BUSY_REASON : empty ? EMPTY_REASON : null);

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

  {#if failureMessage}
    <p role="alert" class="mt-4 text-sm text-danger">{failureMessage}</p>
  {/if}

  <!-- Rendered empty from the start, because an assistive technology only
       announces a change to a live region that already existed. -->
  <p role="status" aria-live="polite" aria-atomic="true" class="mt-3 text-sm text-zinc-300">
    {statusMessage}
  </p>
</section>
