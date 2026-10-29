/**
 * Probe file for the CodeQL findings dismissal case. Delete with the probe PR.
 */
export function probeDismissal(): unknown {
  const tainted = decodeURIComponent(window.location.hash.slice(1));
  return eval(tainted);
}
