# DoodleDash

DoodleDash is an account-free, realtime drawing and guessing party game for up to eight players. It is built with Vite, React, TypeScript, Yjs, Socket.IO, Tailwind CSS, and shadcn/ui conventions.

## Features

- Private six-character rooms and shareable invitation links
- Responsive mouse, touch, and stylus drawing with an expanded canvas mode
- Built-in and custom words, automatic hints, rounds, timers, and fixed scoring
- Realtime player presence, chat, reconnect handling, and host transfer
- Upstash-backed room snapshots with automatic expiry
- Mobile and desktop layouts with accessible controls and reduced-motion support

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- An Upstash Redis database for production
- A hosting platform that supports WebSocket connections

## Environment variables

Copy the example file before starting locally:

```bash
cp .env.example .env.local
```

```env
# Upstash REST API credentials used to save temporary Yjs room snapshots.
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token

# Native TLS Redis connection used for Socket.IO pub/sub between server instances.
REDIS_URL=rediss://default:your-password@your-endpoint.upstash.io:6379

# Public WebSocket origin. Leave empty when the frontend and API share a domain.
VITE_SOCKET_URL=

# Canonical public site origin used in copied room invitation links.
VITE_APP_URL=http://localhost:5173
```

| Variable | Required locally | Required in production | Purpose |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | No | Yes | Loads and saves temporary room snapshots. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Yes | Authenticates requests to the Upstash REST API. Keep it secret. |
| `REDIS_URL` | No | Yes when running multiple instances | Shares Socket.IO events between function/server instances. Keep it secret. |
| `VITE_SOCKET_URL` | No | Only for a separate realtime domain | Overrides the WebSocket server origin, such as `https://realtime.example.com`. |
| `VITE_APP_URL` | Recommended | Yes | Creates correct public invitation URLs. Do not include a trailing slash. |

Variables beginning with `VITE_` are included in the browser bundle. Never put passwords or private tokens in a `VITE_` variable.

### Finding the Upstash values

1. Sign in to the [Upstash Console](https://console.upstash.com/).
2. Create or open a Redis database near the majority of your users.
3. On the database details page, copy the REST URL and REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Click **Connect**, select **ioredis**, and copy the complete `rediss://...` connection string into `REDIS_URL`.
5. Do not commit `.env` or `.env.local`; both are excluded by `.gitignore`.

## Local development

Install dependencies and start both services:

```bash
pnpm install
pnpm dev
```

This starts:

- Vite frontend: `http://localhost:5173`
- Realtime server: `http://127.0.0.1:5174`
- WebSocket proxy: `/api/ws` from Vite to port 5174

Only run one copy of `pnpm dev`. If a port is already occupied, stop the previous process with `Ctrl+C` before restarting.

To test a game locally, create a room in one browser and open the copied invitation in an incognito/private window. Two different browser contexts are needed because each player uses a session-scoped identity.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright command requires browser binaries. Install them once if necessary:

```bash
pnpm exec playwright install chromium
```

## Hosting on Vercel

Vercel is the configured deployment target. Its WebSocket support requires Fluid Compute and is currently documented as beta.

### 1. Prepare the project

Push the repository to GitHub, GitLab, or Bitbucket. Confirm that `pnpm build` succeeds locally and that no secret environment files are committed.

### 2. Create the Vercel project

1. Sign in to [Vercel](https://vercel.com/).
2. Select **Add New → Project** and import the repository.
3. Vercel should detect Vite automatically.
4. Use `pnpm build` as the build command and `dist` as the output directory if they are not detected.

The included `vercel.json` configures the WebSocket function, Mumbai region, SPA rewrites, build command, and output directory.

### 3. Add environment variables

Open **Project → Settings → Environment Variables** and add:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
REDIS_URL=rediss://...
VITE_APP_URL=https://your-project.vercel.app
```

Leave `VITE_SOCKET_URL` empty when the WebSocket API is hosted by the same Vercel project. If you later add a custom domain, change `VITE_APP_URL` to that domain and redeploy.

Add the variables to Production, Preview, and Development as appropriate. Environment-variable changes require a new deployment because Vite variables are embedded during the build.

### 4. Enable and deploy

1. Confirm **Fluid Compute** is enabled in the Vercel project settings.
2. Click **Deploy**.
3. Open the deployment and create a room.
4. Copy the invitation and join from a separate browser/private window.
5. Confirm both players show as live and the host can start the game.

You can also deploy with the CLI:

```bash
pnpm dlx vercel login
pnpm dlx vercel
pnpm dlx vercel --prod
```

See the [Vercel WebSocket documentation](https://vercel.com/docs/functions/websockets) for current limits and availability.

## Hosting elsewhere

DoodleDash can run on any platform that supports a Node.js HTTP server and WebSocket upgrades, such as Railway, Render, Fly.io, or a VPS.

1. Build the frontend with `pnpm build` and serve the `dist` directory as a single-page application.
2. Run `api/ws.ts` behind a Node-compatible server or adapt `server/local.ts` for the platform's assigned `PORT`.
3. Route `/api/ws` to the realtime process with WebSocket upgrades enabled.
4. Set all production environment variables on the hosting platform.
5. If frontend and realtime services use different domains, set `VITE_SOCKET_URL` to the realtime service's HTTPS origin and configure allowed CORS origins in `api/ws.ts`.
6. Use TLS in production: the website must use `https://` and WebSockets must use `wss://`.

For a split deployment, the Vite frontend may remain on Vercel while the persistent realtime server runs elsewhere. Set `VITE_SOCKET_URL` to that server before building the frontend.

## Architecture

- A Yjs document stores conflict-safe room state, strokes, players, and chat.
- Socket.IO uses WebSocket transport to carry Yjs updates.
- The Socket.IO Redis adapter distributes updates across server instances.
- Upstash REST stores encoded Yjs snapshots under expiring `doodledash:room:*` keys.
- Canvas points use normalized coordinates so drawings remain aligned across screen sizes.
- Clients reconnect, request the current Yjs state, and restore live presence after interruptions.

## Troubleshooting

### `EADDRINUSE` on port 5173 or 5174

Another development process is already running. Stop it with `Ctrl+C`, then run `pnpm dev` once.

### Room remains on “Connecting”

- Confirm both `web` and `realtime` report successful startup.
- Verify the Upstash credentials and native `REDIS_URL` format.
- Check the browser console and realtime terminal for connection errors.
- Hard-refresh after changing client environment variables.

### Copied invitation uses the wrong domain

Set `VITE_APP_URL` to the complete public origin and redeploy:

```env
VITE_APP_URL=https://your-domain.example
```

### Players cannot see one another

- Open the invitation in a separate browser or incognito context.
- Confirm WebSocket upgrades are enabled by the hosting provider.
- In multi-instance deployments, confirm `REDIS_URL` is present and reachable.

### Vercel connection periodically reconnects

Vercel WebSockets follow Function maximum-duration limits. DoodleDash reconnects and restores Yjs state automatically; Redis must be configured so a reconnect can land on a different function instance safely.
