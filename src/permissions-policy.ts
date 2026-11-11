/**
 * Permissions-Policy (Phase 24): the camera only where it is needed, for our own origin; the
 * microphone for our own origin (voice input, Phase 19); geolocation, payment and USB off.
 */
export const PERMISSIONS_POLICY = (camera: boolean) => `camera=${camera ? '(self)' : '()'}, microphone=(self), geolocation=(), payment=(), usb=()`;

/** Pages that use the camera: the employee's face check, and the admin's face photo capture (not in the public demo, where uploads are refused). */
export function cameraAllowed(pathname: string, hostedDemo: boolean): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/employee' || (!hostedDemo && path === '/admin/identity');
}
