/** Shared HTTP handling for the identity routes: engine errors → clear JSON answers. */
import { AssistantModelError } from '../assistant/model.ts';
import { domainErrorResponse, problem } from '../web/api.ts';
import { IdentityLimitError } from './service.ts';

export const HOSTED_IDENTITY_MESSAGE = 'The public demo checks identities only on the built-in synthetic specimens (KTP cards marked SPECIMEN with AI-generated faces), so no real ID data is ever uploaded here. Run SentFund locally to check real employees.';

export function identityErrorResponse(error: unknown): Response {
  if (error instanceof IdentityLimitError) return problem(429, 'rate_limited', error.message);
  if (error instanceof AssistantModelError) return problem(502, 'reader_unavailable', `${error.message} Nothing was recorded; try again.`);
  return domainErrorResponse(error);
}
