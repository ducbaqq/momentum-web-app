/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Exclude momentum-collector submodule from webpack compilation
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/momentum-collector/**', '**/node_modules/**'],
    };
    return config;
  },
};
module.exports = nextConfig;