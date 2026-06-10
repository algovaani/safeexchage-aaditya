import dns from 'dns';
import { promisify } from 'util';

const resolveSrv = promisify(dns.resolveSrv);
const resolveTxt = promisify(dns.resolveTxt);

const DOH = 'https://cloudflare-dns.com/dns-query';

async function dohQuery(name, type) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  const json = await res.json();
  if (json.Status !== 0) throw new Error(`DoH status ${json.Status}`);
  return json.Answer || [];
}

async function srvViaDoh(host) {
  const answers = await dohQuery(`_mongodb._tcp.${host}`, 'SRV');
  return answers.map((a) => {
    const [, , port, name] = a.data.split(' ');
    return { name: name.replace(/\.$/, ''), port: Number(port) };
  });
}

async function txtViaDoh(host) {
  const answers = await dohQuery(`_mongodb._tcp.${host}`, 'TXT');
  return answers.map((a) => a.data.replace(/^"|"$/g, '')).join('&');
}

async function srvRecords(host) {
  try {
    dns.setServers(['1.1.1.1', '8.8.8.8', '8.8.4.4']);
    const records = await resolveSrv(`_mongodb._tcp.${host}`);
    return records.map((r) => ({ name: r.name.replace(/\.$/, ''), port: r.port }));
  } catch {
    return srvViaDoh(host);
  }
}

async function txtParams(host) {
  try {
    dns.setServers(['1.1.1.1', '8.8.8.8', '8.8.4.4']);
    const rows = await resolveTxt(`_mongodb._tcp.${host}`);
    return rows.flat().join('&');
  } catch {
    return txtViaDoh(host);
  }
}

/**
 * Converts mongodb+srv:// URIs to mongodb:// when system DNS blocks SRV lookups.
 */
export async function resolveMongoUri(uri) {
  if (!uri?.startsWith('mongodb+srv://')) return uri;

  const body = uri.slice('mongodb+srv://'.length);
  const at = body.indexOf('@');
  if (at < 0) throw new Error('Invalid MONGODB_URI');

  const creds = body.slice(0, at);
  const rest = body.slice(at + 1);
  const qIndex = rest.indexOf('?');
  const hostPart = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : '';

  const slash = hostPart.indexOf('/');
  const host = slash >= 0 ? hostPart.slice(0, slash) : hostPart;
  const dbPath = slash >= 0 ? hostPart.slice(slash) : '';

  const srv = await srvRecords(host);
  if (!srv.length) throw new Error(`No SRV records for ${host}`);

  const params = new URLSearchParams(await txtParams(host));
  params.set('ssl', 'true');
  if (query) {
    for (const [k, v] of new URLSearchParams(query)) params.set(k, v);
  }

  const hosts = srv.map((r) => `${r.name}:${r.port}`).join(',');
  return `mongodb://${creds}@${hosts}${dbPath || ''}?${params}`;
}
