import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
else if (existsSync('.env')) process.loadEnvFile('.env')

const { default: httpServer } = await import('../api/ws.ts')

const port = Number(process.env.REALTIME_PORT || 5174)

httpServer.listen(port, '127.0.0.1', () => {
  console.log(`DoodleDash realtime server listening on http://127.0.0.1:${port}`)
})
