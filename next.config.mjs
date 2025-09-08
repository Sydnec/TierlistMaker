/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ignorer les erreurs ESLint pendant le build de production
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
