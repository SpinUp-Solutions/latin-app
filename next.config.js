const { withSentryConfig } = require('@sentry/nextjs');
const { version } = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    optimizePackageImports: [
      // Radix UI
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      // Other heavy packages
      'lucide-react',
      'recharts',
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
