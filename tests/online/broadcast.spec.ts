import { expect, test } from '@playwright/test';
import type { RoomSnapshot } from '../../src/shared/OnlineProtocol';
import { Peer } from './Peer';

test('commands are coalesced, rejected commands do not broadcast and race events are delivered once', async ({ request, baseURL }) => {
  const response = await request.post('/api/rooms');
  const { code } = await response.json();
  const a = new Peer(baseURL!, code, 'Host');
  await a.wait((message) => message.type === 'welcome');
  const b = new Peer(baseURL!, code, 'Guest');
  const states: RoomSnapshot[] = [];
  a.socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') states.push(message);
  });
  const state = (predicate: (snapshot: RoomSnapshot) => boolean) => a.wait(
    (message): message is RoomSnapshot => message.type === 'state' && predicate(message));
  try {
    await b.wait((message) => message.type === 'welcome');
    await state((snapshot) => snapshot.players.length === 2);
    states.length = 0;
    for (let i = 0; i < 60; i++) a.send({ type: 'ready', ready: i % 2 === 0 });
    // This test measures the batching interval itself, so allow timer delivery.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(states.length).toBeLessThanOrEqual(1);
    b.send({ type: 'ready', ready: true });
    a.send({ type: 'ready', ready: true });
    await state((snapshot) => snapshot.players.every((player) => player.ready));
    a.send({ type: 'start' });
    const loading = await state((snapshot) => snapshot.phase === 'loading');
    states.length = 0;
    for (let i = 0; i < 60; i++) b.send({ type: 'ready', ready: true });
    b.send({ type: 'ping', sentAt: 12345 });
    await b.wait((message) => message.type === 'pong' && message.sentAt === 12345);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(states).toHaveLength(0);
    a.send({ type: 'loaded', matchId: loading.matchId });
    b.send({ type: 'loaded', matchId: loading.matchId });
    await state((snapshot) => snapshot.phase === 'racing');
    const events = states.flatMap((snapshot) => snapshot.race?.events ?? []);
    expect(events.some((entry) => 'type' in entry.event && entry.event.type === 'start')).toBe(true);
    expect(new Set(events.map((entry) => entry.id)).size).toBe(events.length);
  } finally { a.close(); b.close(); }
});

test('a loading disconnect returns to the lobby and the same seat can rejoin', async ({ request, baseURL }) => {
  const response = await request.post('/api/rooms');
  const { code } = await response.json();
  const a = new Peer(baseURL!, code, 'Host');
  await a.wait((message) => message.type === 'welcome');
  const b = new Peer(baseURL!, code, 'Guest');
  let resumed: Peer | undefined;
  try {
    const welcome = await b.wait((message) => message.type === 'welcome');
    if (welcome.type !== 'welcome') throw new Error('Missing seat');
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    await a.wait((message) => message.type === 'state' && message.players.every((player) => player.ready));
    a.send({ type: 'start' });
    await b.wait((message) => message.type === 'state' && message.phase === 'loading');
    b.close(false);
    await new Promise<void>((resolve) => b.socket.addEventListener('close', () => resolve(), { once: true }));
    resumed = new Peer(baseURL!, code, 'Guest', welcome.token);
    expect(await resumed.wait((message) => message.type === 'welcome')).toMatchObject({ playerId: welcome.playerId });
    const restored = await resumed.wait((message): message is RoomSnapshot => message.type === 'state');
    expect(restored.phase).toBe('lobby');
    expect(restored.players).toHaveLength(2);
    expect(restored.players.every((player) => player.connected && !player.ready)).toBe(true);
  } finally { a.close(); b.close(); resumed?.close(); }
});
