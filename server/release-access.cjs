// Authenticated rollout configuration. This module never changes account roles.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const interfaces = new Set(['classic', 'new'])
const failure = (message, status = 400) => Object.assign(Error(message), { status })

module.exports = ({ db, active, origin }) => {
  async function actor(req, admin = true) {
    const user = await active(req, admin)
    let sessionId
    try { sessionId = JSON.parse(Buffer.from(req.headers.authorization.replace(/^Bearer /, '').split('.')[1], 'base64url')).session_id } catch { /* Missing session is rejected below. */ }
    if (!uuid.test(sessionId || '') || !(await db.query('select 1 from auth.sessions where id=$1 and user_id=$2', [sessionId, user.id])).rowCount) {
      throw failure('Sign in again before managing release access.', 401)
    }
    return user
  }

  async function resolve(req, body) {
    const user = await actor(req, false)
    let userId = user.id
    if (user.role === 'admin') {
      if (!body.userId) return { interface: 'new', role: 'admin' }
      if (!uuid.test(body.userId) || !(await db.query("select 1 from public.profiles where id=$1 and role='user'", [body.userId])).rowCount) throw failure('Borrower account unavailable.', 404)
      userId = body.userId
    } else if (user.role !== 'user' || (body.userId && body.userId !== user.id)) throw failure('This account is unavailable.', 403)
    const { rows } = await db.query(`select case when not s.rollout_enabled then 'classic'
      else coalesce(a.interface, s.default_interface) end as interface
      from mobile_private.release_settings s
      left join mobile_private.release_assignments a on a.user_id=$1 where s.id=1`, [userId])
    if (!rows[0]) throw failure('Release access is not configured yet.', 503)
    return rows[0]
  }

  async function list(req) {
    await actor(req)
    const client = await db.connect()
    try {
      await client.query('begin isolation level repeatable read read only')
      const settings = (await client.query('select rollout_enabled,default_interface,version from mobile_private.release_settings where id=1')).rows[0]
      if (!settings) throw failure('Release access is not configured yet.', 503)
      const borrowers = (await client.query(`select p.id,p.name,p.email,p.borrower_account_number as account_number,p.status,
        a.interface as assignment,case when not s.rollout_enabled then 'classic' else coalesce(a.interface,s.default_interface) end as effective_interface
        from public.profiles p cross join mobile_private.release_settings s
        left join mobile_private.release_assignments a on a.user_id=p.id
        where p.role='user' and s.id=1 order by lower(p.name),p.id`)).rows
      const history = (await client.query(`select h.id::text,h.action,h.details,h.created_at,coalesce(p.name,'Initial setup') as actor_name
        from mobile_private.release_history h left join public.profiles p on p.id=h.actor_id
        order by h.id desc limit 50`)).rows
      await client.query('commit')
      return { settings, borrowers, history }
    } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
  }

  async function change(req, body, action) {
    const user = await actor(req)
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) throw failure('Refresh release access before saving.')
    if (action === 'settings' && (typeof body.enabled !== 'boolean' || !interfaces.has(body.defaultInterface))) throw failure('Choose valid rollout settings.')
    const ids = action === 'assign' && Array.isArray(body.userIds) ? [...new Set(body.userIds)] : []
    if (action === 'assign' && (!ids.length || ids.length > 500 || ids.some(id => !uuid.test(id)) || !['classic', 'new', 'default'].includes(body.interface))) throw failure('Choose up to 500 borrower accounts and an interface.')
    const client = await db.connect()
    try {
      await client.query('begin')
      const current = (await client.query('select * from mobile_private.release_settings where id=1 for update')).rows[0]
      if (!current || current.version !== body.expectedVersion) throw failure('Release access changed in another session. Refresh this page before saving again.', 409)
      let details
      if (action === 'settings') {
        if (current.rollout_enabled === body.enabled && current.default_interface === body.defaultInterface) { await client.query('commit'); return { saved: true, changed: 0 } }
        details = { before: { enabled: current.rollout_enabled, defaultInterface: current.default_interface }, after: { enabled: body.enabled, defaultInterface: body.defaultInterface } }
        await client.query('update mobile_private.release_settings set rollout_enabled=$1,default_interface=$2 where id=1', [body.enabled, body.defaultInterface])
      } else {
        const borrowers = (await client.query("select id,name from public.profiles where id=any($1::uuid[]) and role='user' order by id for share", [ids])).rows
        if (borrowers.length !== ids.length) throw failure('One or more borrower accounts are unavailable. Refresh and try again.')
        const previous = new Map((await client.query('select user_id,interface from mobile_private.release_assignments where user_id=any($1::uuid[])', [ids])).rows.map(row => [row.user_id, row.interface]))
        const changes = borrowers.filter(row => (previous.get(row.id) || 'default') !== body.interface).map(row => ({ id: row.id, name: row.name, before: previous.get(row.id) || 'default', after: body.interface }))
        if (!changes.length) { await client.query('commit'); return { saved: true, changed: 0 } }
        const changedIds = changes.map(row => row.id)
        if (body.interface === 'default') await client.query('delete from mobile_private.release_assignments where user_id=any($1::uuid[])', [changedIds])
        else await client.query(`insert into mobile_private.release_assignments(user_id,interface,updated_by)
          select unnest($1::uuid[]),$2,$3 on conflict(user_id) do update set interface=excluded.interface,updated_by=excluded.updated_by,updated_at=now()`, [changedIds, body.interface, user.id])
        details = { changes }
      }
      const version = (await client.query('update mobile_private.release_settings set version=version+1,updated_at=now(),updated_by=$1 where id=1 returning version', [user.id])).rows[0].version
      await client.query('insert into mobile_private.release_history(actor_id,action,details) values($1,$2,$3)', [user.id, action, JSON.stringify(details)])
      await client.query('commit')
      return { saved: true, version }
    } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
  }

  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Vary', 'Origin')
    try {
      if (req.headers.origin && req.headers.origin !== origin) throw failure('This request is not allowed.', 403)
      if (req.method !== 'POST') throw failure('Unsupported request.', 405)
      const action = req.url.slice('/release-access/'.length)
      if (!['resolve', 'list', 'settings', 'assign'].includes(action)) throw failure('Unsupported request.', 404)
      let size = 0
      const chunks = []
      for await (const chunk of req) { size += chunk.length; if (size > 65536) throw failure('Request is too large.', 413); chunks.push(chunk) }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('Invalid request.')
      const result = action === 'resolve' ? await resolve(req, body) : action === 'list' ? await list(req) : await change(req, body, action)
      res.end(JSON.stringify(result))
    } catch (error) {
      const known = !!error.status
      res.writeHead(error.status || 503)
      res.end(JSON.stringify({ error: known ? error.message : 'Release access is unavailable. Your account and records are unchanged.' }))
    }
  }
}
