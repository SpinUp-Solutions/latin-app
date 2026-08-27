interface Config {
  version: string;
  env: string;
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  stripe: {
    publishableKey: string;
  };
}

const config: Config = {
  version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
  env: process.env.NEXT_PUBLIC_ENV || 'development',
  isProduction: process.env.NEXT_PUBLIC_ENV === 'production',
  isStaging: process.env.NEXT_PUBLIC_ENV === 'staging',
  isDevelopment: process.env.NEXT_PUBLIC_ENV === 'development',
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  },
};

export default config;
