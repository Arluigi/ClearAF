import { Client, ClientConfig } from 'pg';
import { Socket } from 'node:net';

type Probe = (signal: AbortSignal) => Promise<boolean>;
type Probes = Record<'database' | 'auth' | 'storage', Probe>;
type Result = { status: 'ready' | 'unavailable' };

/** Instance-local cache limits anonymous monitoring traffic. Public output is deliberately minimal. */
export function createReadiness(probes: Probes, options: {
  timeoutMs?: number; cacheMs?: number; now?: () => number;
} = {}) {
  const { timeoutMs = 2000, cacheMs = 5000, now = Date.now } = options;
  let cached: Result | undefined;
  let expires = 0;
  let flight: Promise<Result> | undefined;
  // Retain outstanding operations until cleanup finishes, including after the
  // HTTP deadline, so concurrent requests cannot accumulate dependency work.
  const outstanding = new Map<string, Promise<boolean>>();
  return function check(): Promise<Result> {
    if (cached && now() < expires) return Promise.resolve(cached);
    if (flight) return flight;
    flight = (async (): Promise<Result> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<boolean[]>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve([false]); }, timeoutMs);
      });
      try {
        const work = Object.entries(probes).map(([name, probe]) => {
          let task = outstanding.get(name);
          if (!task) {
            task = Promise.resolve().then(() => probe(controller.signal)).then(Boolean, () => false);
            outstanding.set(name, task);
            void task.then(() => outstanding.delete(name));
          }
          return task;
        });
        const results = await Promise.race([Promise.all(work), deadline]);
        cached = { status: results.every(Boolean) ? 'ready' : 'unavailable' };
        expires = now() + cacheMs;
        return cached;
      } finally { clearTimeout(timer!); }
    })().finally(() => { flight = undefined; });
    return flight;
  };
}

/** No clinical tables or objects are read. HTTP redirects must not forward credentials. */
export function createDependencyProbes(config: {
  database: Probe;
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
}): Probes {
  const request = config.fetch ?? fetch;
  const headers = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
  const base = config.url.replace(/\/$/, '');
  return {
    database: config.database,
    auth: async signal => {
      const response = await request(`${base}/auth/v1/health`, { headers, signal, redirect: 'error' });
      await response.body?.cancel();
      return response.ok;
    },
    storage: async signal => {
      const response = await request(`${base}/storage/v1/bucket/patient-photos`, { headers, signal, redirect: 'error' });
      if (!response.ok) { await response.body?.cancel(); return false; }
      const bucket = await response.json();
      return bucket?.id === 'patient-photos' && bucket.public === false;
    }
  };
}

export function installHealthRoutes(app: import('express').Express, check: () => Promise<Result>) {
  const noCache = (_req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  };
  app.get('/health', noCache, (_req, res) => { res.json({ status: 'healthy' }); });
  app.get('/ready', noCache, async (_req, res) => {
    try {
      const result = await check();
      res.status(result.status === 'ready' ? 200 : 503).json(result);
    } catch { res.status(503).json({ status: 'unavailable' }); }
  });
}

/** A dedicated disposable connection cannot occupy the application's Prisma pool.
 * Own the socket so even a stalled handshake is forcibly closed on deadline.
 */
export function createDatabaseProbe(connectionString: string, timeoutMs = 1500,
  makeClient: (config: ClientConfig) => Client = config => new Client(config)): Probe {
  return async signal => {
    if (signal.aborted) return false;
    const socket = new Socket();
    const client = makeClient({ connectionString, stream: () => socket,
      connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs, statement_timeout: timeoutMs });
    client.on('error', () => {}); // Errors are deliberately excluded from public output/logs.
    let timer: ReturnType<typeof setTimeout>;
    let cancel: () => void;
    const deadline = new Promise<boolean>(resolve => {
      cancel = () => { socket.destroy(); resolve(false); };
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => { await client.connect(); await client.query('SELECT 1'); return true; })()
          .catch(() => false),
        deadline
      ]);
    } finally {
      clearTimeout(timer!);
      signal.removeEventListener('abort', cancel!);
      socket.destroy();
      // Socket destruction is immediate. Do not extend the HTTP deadline waiting
      // for a graceful PostgreSQL shutdown from an unresponsive peer.
      void client.end().catch(() => {});
    }
  };
}
