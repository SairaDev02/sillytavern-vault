/**
 * Probe for the CodeQL dismissal case (ticket #44). Intentionally injectable.
 */
export function probeDismissal(): unknown {
  const tainted = decodeURIComponent(window.location.hash.slice(1));
  return eval(tainted);
}
