import { RECONNECT_MS, ROOM_CODE_PATTERN, type RoomSnapshot } from '../shared/OnlineProtocol';
import type { TrackId } from '../game/ContentCatalog';
import './online.css';

type LobbyActions = {
  connect: (name: string, code?: string) => void;
  ready: () => void;
  start: () => void;
  track: (trackId: TrackId) => void;
  rematch: () => void;
  leave: () => void;
};

export class OnlineLobby {
  private readonly root = document.createElement('div');
  private readonly dialog: HTMLDialogElement;
  private readonly abort = new AbortController();
  private connected = false;
  private snapshot: RoomSnapshot | null = null;
  private playerId = '';
  private message = 'Create a room, or enter a friend’s 8-character code.';
  private rosterSignature = '';

  constructor(actions: LobbyActions, private readonly announce: (message: string) => void) {
    this.root.innerHTML = `
      <dialog id="online-panel" class="online-panel" aria-labelledby="online-title">
        <span class="flow-eyebrow">Race together · 2–4 players</span>
        <h2 id="online-title">Online Race</h2>
        <div id="online-connect">
          <label for="online-name">Your name</label>
          <input id="online-name" autocomplete="nickname" maxlength="20" required value="Captain" />
          <button id="online-create" class="menu-primary" type="button">Create room</button>
          <div class="online-divider">or join your friends</div>
          <label for="online-code">Room code</label>
          <input id="online-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="8-character code" />
          <button id="online-join" class="menu-quiet" type="button">Join room</button>
        </div>
        <div id="online-room" hidden>
          <div class="online-code-row"><span>Room <strong id="online-room-code"></strong></span>
            <button id="online-copy" class="menu-quiet" type="button">Copy code</button></div>
          <label for="online-track">Course</label>
          <select id="online-track"><option value="sunset-circuit">Sunset Circuit</option><option value="storm-reef">Storm Reef</option></select>
          <ol id="online-players" class="online-players"></ol>
          <p id="online-room-notice" class="online-presence-notice" role="status" aria-live="polite" hidden></p>
          <p id="online-hint"></p>
          <div class="online-actions"><button id="online-ready" class="menu-quiet" type="button">Ready</button>
            <button id="online-start" class="menu-primary" type="button">Start race</button>
            <button id="online-rematch" class="menu-primary" type="button">Back to lobby</button></div>
        </div>
        <p id="online-status" role="status" aria-live="polite"></p>
        <button id="online-leave" class="menu-quiet" type="button">Back to menu</button>
      </dialog>
      <aside id="online-race-panel" class="online-race-panel" aria-label="Online race" hidden>
        <div class="online-race-heading"><strong id="online-race-code"></strong><span id="online-latency"></span></div>
        <ol id="online-standings" class="online-players"></ol>
        <p id="online-race-notice" class="online-presence-notice" role="status" aria-live="polite" hidden></p>
        <p id="online-race-status" role="status"></p>
        <button id="online-race-leave" class="menu-quiet" type="button">Leave race</button>
      </aside>`;
    document.body.append(this.root);
    this.dialog = this.element<HTMLDialogElement>('#online-panel');
    const listen = (selector: string, handler: () => void) => this.element(selector).addEventListener('click', handler, { signal: this.abort.signal });
    const connect = (joining: boolean) => {
      const name = this.element<HTMLInputElement>('#online-name');
      if (!name.reportValidity() || !name.value.trim()) return;
      const code = this.element<HTMLInputElement>('#online-code').value.trim().toUpperCase();
      if (joining && !ROOM_CODE_PATTERN.test(code)) { this.status('Enter an 8-character room code.', false); return; }
      actions.connect(name.value.trim(), joining ? code : undefined);
    };
    listen('#online-create', () => connect(false));
    listen('#online-join', () => connect(true));
    listen('#online-ready', actions.ready);
    listen('#online-start', actions.start);
    listen('#online-rematch', actions.rematch);
    listen('#online-leave', actions.leave);
    listen('#online-race-leave', actions.leave);
    listen('#online-copy', () => {
      void navigator.clipboard?.writeText(this.snapshot?.code ?? '').then(
        () => this.status('Room code copied. Share it with your friends.', this.connected),
        () => this.status('Select the room code above to copy it.', this.connected),
      );
    });
    this.element<HTMLSelectElement>('#online-track').addEventListener('change', (event) =>
      actions.track((event.target as HTMLSelectElement).value as TrackId), { signal: this.abort.signal });
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); actions.leave(); }, { signal: this.abort.signal });
    this.element('#online-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') connect(true); }, { signal: this.abort.signal });
  }

  open(): void {
    this.snapshot = null;
    this.rosterSignature = '';
    this.connected = false;
    this.element('#online-connect').hidden = false;
    this.element('#online-room').hidden = true;
    this.element('#online-title').textContent = 'Online Race';
    this.element('#online-race-panel').hidden = true;
    this.clearPresenceNotice();
    this.status('Create a room, or enter a friend’s 8-character code.', false);
    this.dialog.showModal();
    this.element<HTMLInputElement>('#online-name').focus();
  }

  close(): void {
    this.dialog.close();
    this.element('#online-race-panel').hidden = true;
  }

  status(message: string, connected: boolean, pending = false): void {
    this.message = message;
    this.connected = connected;
    this.element('#online-status').textContent = message;
    this.element('#online-race-status').textContent = message;
    this.element<HTMLButtonElement>('#online-create').disabled = pending;
    this.element<HTMLButtonElement>('#online-join').disabled = pending;
    if (!connected) {
      for (const selector of ['#online-ready', '#online-start', '#online-rematch']) this.element<HTMLButtonElement>(selector).disabled = true;
      this.element<HTMLSelectElement>('#online-track').disabled = true;
    }
    if (!connected && this.snapshot && !this.dialog.open) this.dialog.showModal();
  }

  update(snapshot: RoomSnapshot, playerId: string, connected: boolean, rtt: number): void {
    this.updatePresenceNotice(snapshot, playerId);
    this.snapshot = snapshot;
    this.playerId = playerId;
    this.connected = connected;
    const racing = snapshot.phase === 'countdown' || snapshot.phase === 'racing';
    if (racing && connected) this.dialog.close();
    else if (!this.dialog.open) this.dialog.showModal();
    this.element('#online-race-panel').hidden = !racing;
    this.element('#online-connect').hidden = true;
    this.element('#online-room').hidden = false;
    this.element('#online-title').textContent = snapshot.phase === 'results' ? 'Race results' : 'Race room';
    this.element('#online-room-code').textContent = snapshot.code;
    this.element('#online-race-code').textContent = `ROOM ${snapshot.code}`;
    this.element('#online-latency').textContent = `${rtt} ms`;
    const host = playerId === snapshot.hostId;
    const lobby = snapshot.phase === 'lobby';
    const self = snapshot.players.find((player) => player.id === playerId);
    const track = this.element<HTMLSelectElement>('#online-track');
    track.value = snapshot.trackId;
    track.disabled = !host || !lobby || !connected;
    const ready = this.element<HTMLButtonElement>('#online-ready');
    ready.hidden = !lobby;
    ready.disabled = !connected;
    ready.textContent = self?.ready ? 'Not ready' : 'Ready';
    ready.setAttribute('aria-pressed', String(!!self?.ready));
    const start = this.element<HTMLButtonElement>('#online-start');
    start.hidden = !lobby || !host;
    start.disabled = !connected || snapshot.players.length < 2 || snapshot.players.some((player) => !player.ready || !player.connected);
    const rematch = this.element<HTMLButtonElement>('#online-rematch');
    rematch.hidden = snapshot.phase !== 'results' || !host;
    rematch.disabled = !connected;
    this.element('#online-leave').textContent = 'Leave room';
    this.element('#online-hint').textContent = snapshot.phase === 'loading' ? 'Loading the course. Waiting for all racers…'
      : lobby ? 'Everyone must be ready. The host chooses the course and starts the race.'
        : snapshot.phase === 'results' ? 'The host can take everyone back to the lobby for another race.' : 'The race continues while your menu is open.';
    const remaining = snapshot.race?.remaining;
    const raceSelf = snapshot.race?.racers.find((racer) => racer.id === playerId);
    const opponents = snapshot.players.filter((player) => player.id !== playerId);
    const allOpponentsLeft = opponents.length > 0 && opponents.every((player) => player.dnf && !player.connected);
    const opponentsReconnecting = opponents.some((player) => !player.connected && !player.dnf);
    this.element('#online-race-status').textContent = !connected ? this.message : self?.dnf ? 'Did not finish'
      : raceSelf?.race.finished ? `Finished #${raceSelf.race.place} — waiting for racers`
        : allOpponentsLeft ? 'All opponents have left. Finish the race or leave the room.'
          : opponentsReconnecting ? 'An opponent is reconnecting. Your race continues.'
            : remaining != null ? `${Math.ceil(remaining)}s until final results` : 'Three laps · every checkpoint counts';
    this.renderRoster();
  }

  dispose(): void { this.abort.abort(); this.root.remove(); }

  private clearPresenceNotice(): void {
    for (const selector of ['#online-room-notice', '#online-race-notice']) {
      this.element(selector).hidden = true;
      this.element(selector).textContent = '';
    }
  }

  private updatePresenceNotice(snapshot: RoomSnapshot, playerId: string): void {
    const previous = this.snapshot;
    if (!previous || previous.code !== snapshot.code) return;
    if (previous.matchId !== snapshot.matchId) this.clearPresenceNotice();
    const changes: string[] = [];
    let announcement = 'PLAYER LEFT';
    for (const before of previous.players) {
      if (before.id === playerId) continue;
      const after = snapshot.players.find((player) => player.id === before.id);
      if (!after) changes.push(`${before.name} left the room.`);
      else if (before.connected && !after.connected) {
        changes.push(after.dnf ? `${after.name} left the race.`
          : `${after.name} disconnected. Waiting up to ${RECONNECT_MS / 1000} seconds for reconnection.`);
        if (!after.dnf) announcement = 'PLAYER DISCONNECTED';
      } else if (!before.connected && after.connected) {
        changes.push(`${after.name} reconnected.`);
        announcement = 'PLAYER RECONNECTED';
      } else if (!before.dnf && after.dnf && !after.connected) changes.push(`${after.name} did not reconnect and has left the race.`);
    }
    if (changes.length === 0) return;
    if (previous.hostId !== snapshot.hostId && snapshot.hostId === playerId) changes.push('You are now the host.');
    const message = changes.join(' ');
    // Keep the last membership change visible; ordinary 20 Hz snapshots must not
    // overwrite it or repeatedly announce it to assistive technology.
    for (const selector of ['#online-room-notice', '#online-race-notice']) {
      this.element(selector).textContent = message;
      this.element(selector).hidden = false;
    }
    this.announce(announcement);
  }

  private renderRoster(): void {
    const snapshot = this.snapshot!;
    const players = [...snapshot.players].sort((a, b) => {
      const place = (id: string) => snapshot.race?.racers.find((racer) => racer.id === id)?.race.place ?? 0;
      return place(a.id) - place(b.id);
    });
    const rows = players.map((player) => {
      const racer = snapshot.race?.racers.find((entry) => entry.id === player.id)?.race;
      const status = player.dnf ? (player.connected ? 'DNF' : 'Left race (DNF)') : !player.connected ? 'Reconnecting' : racer?.finished
        ? `${racer.finishTime?.toFixed(2)}s` : snapshot.phase === 'lobby' ? player.ready ? 'Ready' : 'Waiting' : `Lap ${racer?.displayLap ?? 1}/3`;
      return { slot: player.slot, text: `${player.name}${player.id === this.playerId ? ' (you)' : ''}${player.id === snapshot.hostId ? ' ★' : ''}`, status };
    });
    const signature = JSON.stringify(rows);
    if (signature === this.rosterSignature) return;
    this.rosterSignature = signature;
    for (const selector of ['#online-players', '#online-standings']) {
      const list = this.element(selector);
      list.replaceChildren(...rows.map((row) => {
        const item = document.createElement('li');
        item.dataset.slot = String(row.slot);
        const name = document.createElement('span');
        name.textContent = row.text;
        const status = document.createElement('small');
        status.textContent = row.status;
        item.append(name, status);
        return item;
      }));
    }
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
}
