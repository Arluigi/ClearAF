// A second local API for a physical Debug device. Baseline .env is never modified.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const dns = require('node:dns/promises');
const { spawn } = require('node:child_process');

function validateHost(host) {
  if (typeof host !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.local$/.test(host) || /\s/.test(host)) {
    throw Error('Supply one Bonjour .local hostname, without a URL, port or whitespace.');
  }
  return host;
}
function localURL(value, protocols, port) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.search && !url.hash && url.port === port;
  } catch { return false; }
}
function deviceEnvironment(baseline, host, resolved, localAddresses) {
  validateHost(host);
  if (baseline.NODE_ENV !== 'development' || baseline.PORT !== '3001'
      || !localURL(baseline.SUPABASE_URL, ['http:'], '54321')
      || !localURL(baseline.DATABASE_URL, ['postgres:', 'postgresql:'], '54322')
      || !localURL(baseline.DIRECT_URL, ['postgres:', 'postgresql:'], '54322')
      || !baseline.SUPABASE_ANON_KEY || !baseline.SUPABASE_SERVICE_ROLE_KEY) {
    throw Error('Expected the existing loopback-only development backend configuration. Run local setup first.');
  }
  if (!resolved.length || resolved.some(address => !localAddresses.includes(address))) {
    throw Error('The Bonjour hostname must resolve only to network addresses on this Mac.');
  }
  return { ...baseline, PORT: '3002', SUPABASE_URL: `http://${host}:54321` };
}
async function main() {
  const host = validateHost(process.argv[2]);
  const backend = path.resolve(__dirname, '../backend');
  const baseline = require(path.join(backend, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(backend, '.env')));
  const addresses = (await dns.lookup(host, { all: true })).map(entry => entry.address);
  const localAddresses = Object.values(os.networkInterfaces()).flat().filter(Boolean).map(entry => entry.address);
  const configuration = deviceEnvironment(baseline, host, addresses, localAddresses);
  // Explicit configuration wins over inherited process values; dotenv does not override it.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: backend, env: { ...process.env, ...configuration }, stdio: 'inherit'
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Unable to start the local device API.'); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1); });
  console.log(`Debug device API starting at http://${host}:3002; baseline API and configuration are unchanged.`);
}
module.exports = { validateHost, deviceEnvironment };
if (require.main === module) main().catch(() => { console.error('Local device startup refused. Verify local setup, a valid Bonjour hostname and this Mac’s network resolution.'); process.exitCode = 1; });
