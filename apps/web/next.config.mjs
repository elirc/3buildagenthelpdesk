/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@agentdesk/agents",
    "@agentdesk/db",
    "@agentdesk/domain",
    "@agentdesk/observability",
    "@agentdesk/shared",
    "@agentdesk/ui"
  ],
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;
