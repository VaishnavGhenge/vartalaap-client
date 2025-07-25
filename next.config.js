/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['@svgr/webpack'],
    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/,
            use: ['@svgr/webpack'],
        });

        return config;
    },
};

module.exports = nextConfig;
