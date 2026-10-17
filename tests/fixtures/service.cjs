const crypto = require('node:crypto');
const { Pool } = require('pg');
// Fixture administration is limited to the isolated loopback services.
const api = process.env.FIXTURE_AUTH_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(api).hostname)) throw Error('Fixture authentication must use a loopback service.');
// Each spec owns and closes its pool. Playwright may reuse one worker across
// files, so a shared cached pool would already be closed by the previous spec.
const createPool = () => new Pool({ host: '127.0.0.1', port: Number(process.env.FIXTURE_DB_PORT || 54322), user: 'postgres', password: process.env.FIXTURE_DB_PASSWORD || 'postgres', database: 'postgres' });
const secret = process.env.LOCAL_SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
function jwt(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({alg:'HS256',typ:'JWT'}) + '.' + encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
  return token + '.' + crypto.createHmac('sha256',secret).update(token).digest('base64url');
}
async function localAuth(path, method, payload) {
  const response = await fetch(api + '/auth/v1/' + path, {method,headers:{apikey:jwt('anon'),Authorization:'Bearer '+jwt('service_role'),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});
  if (!response.ok) throw Error('Fixture authentication failed (' + response.status + ').');
  return response.json();
}
module.exports = { get db() { return createPool(); }, localAuth };
