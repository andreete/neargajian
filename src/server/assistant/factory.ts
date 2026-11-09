/**
 * Which model the payroll assistant uses on this copy:
 * - ANTHROPIC_API_KEY set → the Claude API (ASSISTANT_MODEL, default from Anthropic's docs);
 * - no key → null: the assistant is off ("no API key") and everything else works;
 * - ASSISTANT_STUB=browser-tests with a database under .tmp/ → the labelled test stub (browser tests only).
 * The key's value never leaves this module's client constructor.
 */
import { anthropicModel, DEFAULT_ASSISTANT_MODEL, type AssistantModel } from './model.ts';
import { stubModel } from './stub-model.ts';

let override: AssistantModel | null | undefined;

export function assistantModelFrom(env: Readonly<Record<string, string | undefined>>): AssistantModel | null {
  if (env.ASSISTANT_STUB === 'browser-tests') {
    if (!(env.DATABASE_URL ?? '').includes('.tmp/')) throw new Error('ASSISTANT_STUB is for browser tests on a database under .tmp/ only');
    return stubModel();
  }
  const apiKey = (env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return anthropicModel({ apiKey, model: (env.ASSISTANT_MODEL ?? '').trim() || DEFAULT_ASSISTANT_MODEL });
}

let cached: AssistantModel | null | undefined;

export function getAssistantModel(): AssistantModel | null {
  if (override !== undefined) return override;
  cached ??= assistantModelFrom(process.env);
  return cached;
}

/** Test-only: install a stub (or null = no key). Refused outside NODE_ENV=test. */
export function setAssistantModelForTests(model: AssistantModel | null | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only');
  override = model;
}
