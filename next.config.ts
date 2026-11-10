import type { NextConfig } from 'next';

// Security headers for every response. The Content-Security-Policy with a per-request
// nonce is set by src/proxy.ts for pages; API responses get a locked-down CSP here.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native modules stay out of the server bundle: better-sqlite3, and the identity check's
  // onnxruntime-node (face models) and sharp (image decoding).
  serverExternalPackages: ['better-sqlite3', 'onnxruntime-node', 'sharp'],
  experimental: {
    // forbidden() → 403 page for authenticated users with the wrong role.
    authInterrupts: true,
    // Shared host with tight memory: one build worker.
    cpus: 1,
  },
  // Never trace Rust build output or local data into the server bundle, nor onnxruntime's GPU
  // providers (hundreds of MB; the face engine runs on the CPU only).
  outputFileTracingExcludes: {
    '*': ['contracts/**', '.tmp/**', 'data/**', 'docs/**', 'models/**', 'node_modules/onnxruntime-node/bin/**/*providers_cuda*', 'node_modules/onnxruntime-node/bin/**/*providers_tensorrt*'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
