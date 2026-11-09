/**
 * TEST-ONLY stand-in for the model (unit tests and browser tests; never the main flow).
 * A deliberately naive keyword parser that imitates the model's structured answer, including
 * being "fooled" by an injected instruction, so the tests prove that the APP's checks (directory,
 * caps, literal amount, currency, no NEAR accounts) hold whatever the model returns.
 * Enabled in a running server only with ASSISTANT_STUB=browser-tests and a database under .tmp/
 * (see factory.ts); the UI then says "Test stub model (browser tests only)".
 */
import type { AssistantModel, AssistantTurn, DraftRequest } from './model.ts';

const MONTHS = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/;

export function interpretLikeStub(turns: AssistantTurn[], divisions: string[]): DraftRequest {
  const text = turns.filter((t) => t.role === 'user').map((t) => t.text).join('\n');
  const lower = text.toLowerCase();
  const base: DraftRequest = { action: 'draft', title: null, divisions: [], recipients: [], amount_per_person: null, currency: null, posting_mode: null, question: null, refusal_reason: null };
  if (/\b(approve|release|submit|workflow|weather|poem)\b/.test(lower) && !/\bignore\b/.test(lower)) {
    return { ...base, action: 'refuse', refusal_reason: 'I can only draft payroll runs.' };
  }
  const titleMatch = /\bcalled\s+["“]?([^"”,.\n]+)/i.exec(text);
  const title = titleMatch?.[1]?.trim() ?? null;
  let rest = titleMatch ? text.replace(titleMatch[0], ' ') : text;
  const qualified = new Map<string, string>();
  for (const d of divisions) {
    for (const m of rest.matchAll(new RegExp(`\\b([A-Z][a-z]+(?: [A-Z][a-z]+)+) (?:in|from) (?:the )?${d}\\b`, 'g'))) qualified.set(m[1]!.replace(/^(?:(?:Create|Pay|Draft|Ignore|Please|Send)\s+)+/, ''), d);
    rest = rest.replace(new RegExp(`\\b(in|from) (the )?${d}\\b`, 'g'), ' ');
  }
  const divs = divisions.filter((d) => rest.toLowerCase().includes(d.toLowerCase()));
  const names = [...rest.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g)].map((m) => m[1]!.replace(/^(?:(?:Create|Pay|Draft|Ignore|Please|Send)\s+)+/, ''))
    .filter((n) => n.includes(' ') && !divisions.some((d) => n.toLowerCase().includes(d.toLowerCase())) && !n.split(' ').some((w) => MONTHS.test(w)));
  // A fooled model would pass an account through as a "name": the app must refuse it.
  for (const acct of rest.matchAll(/\b[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near)\b/g)) names.push(acct[0]);
  const people = names.map((name) => ({ name, division: qualified.get(name) ?? null }));
  const amount = /(?:^|[^\w.])(\d+(?:\.\d+)?)(?![\w.])/.exec(rest)?.[1] ?? null;
  const currency = /\b(tusdc|usdc|usd|eur|gbp|idr|near)\b/i.exec(rest.replace(/\b[a-z0-9_-]+\.(testnet|near)\b/gi, ''))?.[1] ?? null;
  const posting = /\bdetailed\b/i.test(text) ? 'detailed' : /\bconsolidated\b/i.test(text) ? 'consolidated' : null;
  const req: DraftRequest = { ...base, title, divisions: divs, recipients: people, amount_per_person: amount, currency, posting_mode: posting };
  if (!divs.length && !people.length) return { ...req, action: 'ask', question: 'Who should be paid? Name a division or the recipients.' };
  if (!amount) return { ...req, action: 'ask', question: 'How much should each person receive, in tUSDC?' };
  return req;
}

export function stubModel(answer?: (turns: AssistantTurn[], divisions: string[]) => DraftRequest | Promise<DraftRequest>): AssistantModel & { seen: { turns: AssistantTurn[]; divisions: string[] }[] } {
  const seen: { turns: AssistantTurn[]; divisions: string[] }[] = [];
  return {
    id: 'test-stub',
    stub: true,
    seen,
    async interpret({ turns, divisions }) {
      seen.push({ turns, divisions });
      return answer ? answer(turns, divisions) : interpretLikeStub(turns, divisions);
    },
  };
}
