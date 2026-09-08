import type { TrackDefinition } from './ContentCatalog';

/** A complete course revision: narrow hull run, open bypass, and an optional current slingshot. */
export function strengthenHarbor(track: TrackDefinition): TrackDefinition {
  return {
    ...track,
    rulesRevision: 2,
    difficulty: 'Technical',
    subtitle: '船腹抢线 · 漩流弹射 · 港湾追逐',
    description: '选蓝色外线安全绕船，或穿金色船腹抢双门；切进紫色漩流借力出弯。',
    controlPoints: [[0,-112],[48,-112],[104,-108],[146,-86],[160,-42],[140,-6],
      [93,0],[67,29],[82,67],[119,94],[72,125],[9,127],[-53,113],[-103,78],
      [-122,30],[-108,-13],[-72,-39],[-104,-69],[-64,-107],[-29,-116]],
    checkpoints: track.checkpoints.map((gate, i) => i === 0 ? { ...gate, progress: .035 } : gate),
    interactions: [
      { id: 'harbor-hull-entry', kind: 'boost-gate', progress: .065, lateralOffset: 3, halfWidth: 2.8, cooldown: 7, reward: .55 },
      { id: 'harbor-hull-exit', kind: 'boost-gate', progress: .086, lateralOffset: -3, halfWidth: 2.8, cooldown: 7, reward: .45 },
      { id: 'harbor-dock-drift', kind: 'drift-gate', progress: .405, lateralOffset: -3, halfWidth: 3.6, cooldown: 7, reward: .65 },
      { id: 'harbor-current-exit', kind: 'boost-gate', progress: .6, lateralOffset: 15, halfWidth: 3.6, cooldown: 7, reward: .4 },
      { id: 'harbor-home', kind: 'boost-gate', progress: .9, lateralOffset: 2.4, halfWidth: 3.4, cooldown: 7, reward: .35 },
    ],
    rocks: track.rocks.filter(rock => rock.progress > .3),
    currents: [{ id: 'harbor-slingshot', progress: .565, lateralOffset: 43, innerRadius: 9, outerRadius: 40, speed: 10, spin: 1 }],
    routes: [
      { id: 'harbor-bypass', label: 'SAFE / 外侧绕行', hint: '蓝线绕船 · 宽水面 · 提前回到下一检查点', kind: 'safe',
        anchors: [[.012,0],[.032,16],[.05,27],[.08,28],[.102,22],[.125,0]] },
      { id: 'harbor-hull', label: 'HULL RUN / 船腹双门', hint: '金线抢门 · 左右换线 · 连续补充增压', kind: 'risk',
        anchors: [[.025,0],[.05,0],[.065,3],[.075,0],[.086,-3],[.108,0]] },
      { id: 'harbor-current', label: 'SLINGSHOT / 借流弹射', hint: '紫线切入顺流边缘 · 反打修正 · 出弯加速', kind: 'current',
        anchors: [[.5,0],[.53,12],[.565,19],[.6,15],[.63,0]] },
    ],
    landmarks: [
      { id: 'harbor-leviathan', kind: 'cargo', progress: .075, lateralOffset: 0 },
      { id: 'harbor-drydock', kind: 'cargo', progress: .5, lateralOffset: -100 },
    ],
  };
}
