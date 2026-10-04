/** Helpers that keep spoken/stored sentences clean. Rules are general, not tuned to any fragment. */

const AUX =
  /^(is|are|am|was|were|do|does|did|can|could|would|will|should|shall|has|have|had|may|might|what|where|when|who|whom|whose|why|how|which)\b/i;

/** True when the text already reads as a question. */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  return /\?\s*$/.test(t) || AUX.test(t);
}

function stripEnd(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?…\s]+$/, '');
}

/** Exactly one trailing question mark, never doubled punctuation. */
export function toQuestion(text: string): string {
  return `${stripEnd(text)}?`;
}

/**
 * The yes/no question to ask. A hypothesis that already is a question is used as is
 * (only its trailing punctuation is normalised); a statement gets wrapped once.
 */
export function buildConfirmQuestion(opts: { question?: string | null; sentence?: string | null }): string {
  const q = opts.question?.trim();
  if (q) return toQuestion(q);
  const s = opts.sentence?.trim();
  if (!s) return 'Do you mean this?';
  if (isQuestion(s)) return toQuestion(s);
  return `Do you mean: ${stripEnd(s)}?`;
}

const LABEL =
  /^(?:please\s+note|note|reminder|important|summary|confirmed(?:\s+sentence)?|final(?:\s+sentence)?|sentence|answer|translation|do\s+you\s+mean)\s*[:\-–—]\s*/i;

/**
 * The cleaned sentence that is safe to speak and learn from, or null when the text is not a
 * usable patient sentence (commentary, empty, or absurdly long).
 */
export function cleanConfirmedSentence(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.split(/\r?\n/).find((l) => l.trim()) ?? '';
  s = s.replace(/[*_`#>]+/g, '').trim();
  for (let i = 0; i < 3 && LABEL.test(s); i++) s = s.replace(LABEL, '').trim();
  s = s
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^please\s+note\b/i.test(s)) return null;
  if (s.length < 3 || s.length > 200) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  return s.replace(/([?!.])\1+$/, '$1').replace(/\?[.!]+$/, '?');
}
