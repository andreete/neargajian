/** The identity check's engines on this copy (face models + KTP reader) and the NIK hash key. */
import { getConfig } from '../config.ts';
import { getFaceEngine } from './face.ts';
import { getKtpReader } from './ktp-reader.ts';
import type { IdentityDeps } from './service.ts';

export function identityDeps(): IdentityDeps {
  return { face: getFaceEngine(), reader: getKtpReader(), secret: getConfig().sessionSecret };
}

export interface IdentityEngineStatus { face: string | null; reader: { id: string; stub: boolean } | null; ready: boolean }

export function identityEngineStatus(): IdentityEngineStatus {
  const { face, reader } = identityDeps();
  return { face: face?.id ?? null, reader: reader ? { id: reader.id, stub: reader.stub } : null, ready: Boolean(face && reader) };
}
