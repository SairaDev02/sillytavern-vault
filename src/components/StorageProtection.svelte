<script lang="ts">
  import type { PersistentStorage } from '../persistent-storage.svelte';

  /**
   * The browser's eviction-protection answer for the page, and one way to ask
   * again. It renders; the page-scope owner holds the state and the request
   * rule, so this component never asks the browser by itself.
   */

  const LABEL = 'Browser storage protection';
  const TRY_AGAIN = 'Try again';
  // The visible words stay part of the accessible name.
  const TRY_AGAIN_NAME = 'Try again asking this browser to protect your storage';

  let { protection }: { protection: PersistentStorage } = $props();
</script>

<!--
  Its own polite line, below the Backup's status, so a storage answer never
  competes with the Backup or Restore feedback and never takes focus. The line
  is rendered empty from the start, because an assistive technology only
  announces a change to a live region that already existed.
-->
<div class="mt-6 border-t border-border pt-4">
  <h3 class="text-sm font-medium text-zinc-200">{LABEL}</h3>

  <p role="status" aria-live="polite" aria-atomic="true" class="mt-1 text-sm text-zinc-400">
    {protection.message}
  </p>

  {#if protection.canRetry}
    <button
      type="button"
      onclick={() => protection.retry()}
      disabled={protection.pending}
      aria-label={TRY_AGAIN_NAME}
      class="mt-2 rounded-lg border border-border px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {TRY_AGAIN}
    </button>
  {/if}
</div>
