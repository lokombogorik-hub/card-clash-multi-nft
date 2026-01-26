import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // node:* imports
            'node:crypto': 'crypto-browserify',
            'node:stream': 'stream-browserify',
            'node:util': 'util',
            'node:process': 'process',
            'node:buffer': 'buffer',

            // classic imports
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            util: 'util',
            process: 'process',
            buffer: 'buffer',
        },
    },
    define: {
        global: 'globalThis',
        'process.env': {},
    },
    optimizeDeps: {
        include: [
            'crypto-browserify',
            'stream-browserify',
            'util',
            'process',
            'buffer',
        ],
    },
})