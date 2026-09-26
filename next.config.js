// Next.js loads this configuration as CommonJS; keep these imports in its native format.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require('@sentry/nextjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tests import separately deployed Firebase Functions; check them in CI after
  // installing that package's dependencies, rather than in the Netlify build.
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
  serverExternalPackages: ['pdf-lib', '@pdf-lib/fontkit'],
  outputFileTracingIncludes: {
    '/api/test-results/[attemptId]/pdf': ['./src/lib/tests/fonts/**/*'],
    '/src/app/api/test-results/[attemptId]/pdf/route': ['./src/lib/tests/fonts/**/*'],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    optimizePackageImports: [
      // Radix UI
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      // Other heavy packages
      'lucide-react',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      'framer-motion',
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: 'charalampos-tsitsiringos',
  project: 'latin-app',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: version },
  widenClientFileUpload: true,
  // Tunnel helps production/ad-blockers; skip in next dev where Turbopack forwarding can drop events.
  ...(process.env.NODE_ENV === 'production' ? { tunnelRoute: '/monitoring' } : {}),
  silent: !process.env.CI,
});
