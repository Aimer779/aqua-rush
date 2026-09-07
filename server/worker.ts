import { PROTOCOL_VERSION, ROOM_CODE_PATTERN } from '../src/shared/OnlineProtocol';
export { RaceRoom } from './RaceRoom';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ ok: true, version: PROTOCOL_VERSION });
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Origin not allowed', { status: 403 });
    // Anonymous friend rooms have no account identity. This intentionally generous
    // per-IP cap also allows several players behind the same household router.
    const key = `aqua-rush:${request.headers.get('CF-Connecting-IP') ?? 'local'}`;
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!(await env.CREATE_LIMIT.limit({ key })).success) return new Response('Too many rooms. Try again in a minute.', { status: 429 });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        const code = [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const result = await room.fetch(new Request(`${url.origin}/create/${code}`, { method: 'POST' }));
        if (result.status === 409) continue;
        return result;
      }
      return new Response('Could not create a room. Try again.', { status: 503 });
    }
    const code = url.pathname.slice('/api/rooms/'.length);
    if (url.pathname.startsWith('/api/rooms/') && ROOM_CODE_PATTERN.test(code) && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      if (!(await env.CONNECT_LIMIT.limit({ key })).success) return new Response('Too many connections. Try again in a minute.', { status: 429 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
