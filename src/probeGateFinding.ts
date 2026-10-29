/**
 * Probe file for the CodeQL findings rule. It contains intentionally injectable
 * sinks fed by an attacker-controlled source, and it exists only on the probe
 * branch. Delete it with the probe pull request.
 */
export function probeCodeInjection(): void {
  const tainted = decodeURIComponent(window.location.hash.slice(1));
  eval(tainted);
  new Function(tainted)();
  document.write(tainted);
}
