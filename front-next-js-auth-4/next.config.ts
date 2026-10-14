import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	poweredByHeader: false
}

export default (phase: string): NextConfig => ({
	...nextConfig,
	distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'
})
