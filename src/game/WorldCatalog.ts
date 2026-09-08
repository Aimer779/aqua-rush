import type { EnvironmentPreset, TrackDefinition, WavePreset } from './ContentCatalog';
import type { BlockDefinition } from './WorldMechanics';

export type TrackId = 'breakwater' | 'nightfall' | 'sunken-temple';

function banks(style: BlockDefinition['style'], height: number, side: number, count: number, distance: number): BlockDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${style}-${side}-${i}`, progress: (i + .4) / count, lateralOffset: side * (distance + (i % 3) * 3),
    width: 15 + (i % 3) * 4, length: 18 + (i % 2) * 6, height: height + (i % 4) * 7, style,
  }));
}

function piers(progresses: number[], height: number): BlockDefinition[] {
  return progresses.flatMap(progress => [-1, 1].map(side => ({
    id: `pier-${progress}-${side}`, progress, lateralOffset: side * 30,
    width: 7, length: 8, height, style: 'concrete' as const,
  })));
}

export function createWorlds(day: EnvironmentPreset, night: EnvironmentPreset, calm: WavePreset, rough: WavePreset): Record<TrackId, TrackDefinition> {
  const make = (id: TrackId, name: string, subtitle: string, description: string, environment: EnvironmentPreset,
    controlPoints: readonly (readonly [number, number])[]): TrackDefinition => ({
    id, name, displayName: name, subtitle, description, environment, environmentPreset: environment,
    difficulty: id === 'breakwater' ? 'Breezy' : 'Technical', seed: 8400 + name.length,
    halfWidth: 13, width: 26, buoySpacing: 36, lapCount: 3,
    spawnGrid: [{ progress: .987, lane: -1.5 }, { progress: .987, lane: 1.5 }, { progress: .978, lane: -1.5 }, { progress: .978, lane: 1.5 }],
    markerPreset: 'sunset-race',
    waves: id === 'sunken-temple' ? rough : calm, wavePreset: id === 'sunken-temple' ? rough : calm,
    timeTrialTargets: { gold: 130, silver: 155, bronze: 190 }, controlPoints,
    checkpoints: Array.from({ length: 12 }, (_, i) => ({ id: id + '-sector-' + i, progress: i === 11 ? 0 : (i + 1) / 12,
      halfWidth: 21, height: i === 2 || i === 7 ? 15 : 7, visible: i % 2 === 1, role: i === 11 ? 'finish' : i % 2 === 1 ? 'sector' : 'anti-cut' })),
    interactions: [{ id: id + '-boost', kind: 'boost-gate', progress: .34, lateralOffset: 2, halfWidth: 3.5, cooldown: 7, reward: .55 },
      { id: id + '-drift', kind: 'drift-gate', progress: .59, lateralOffset: -2, halfWidth: 3.5, cooldown: 7, reward: .65 }],
    rocks: [{ id: id + '-debris-1', progress: .37, lateralOffset: -13, radius: 3, height: 4 }, { id: id + '-debris-2', progress: .77, lateralOffset: 14, radius: 3.2, height: 4 }], ai: { lookAheadScale: .85, speedScale: .98, preferredLines: [1.5, -1.5, 0] },
  });
  const breakwater = make('breakwater', '断潮坝', 'BREAKWATER', '冲上泄洪跳台，飞越防波堤。落水后接增压，冲进下一道峡湾。',
    { ...day, id: 'breakwater', label: '泄洪高架 / 飞跃 / 连续弯', water: '#087f94', deepWater: '#033849', foam: '#a9fff2', fog: '#759fba', skyTop: '#184273', skyMid: '#619cac', horizon: '#f9cda6', exposure: 1.1 },
    [[0,-180],[62,-180],[129,-154],[155,-99],[113,-57],[77,-19],[110,35],[151,77],[121,127],[58,158],[3,130],[-44,93],[-105,120],[-151,74],[-150,9],[-103,-39],[-151,-85],[-112,-149],[-53,-180]]);
  const nightfall = make('nightfall', '霓虹沉城', 'NIGHTFALL', '在被海水淹没的街区追逐。提前读闸门灯号，穿楼、切弯、抢窗口。',
    { ...night, id: 'nightfall', label: '建筑峡谷 / 周期闸门 / 夜航', water: '#125b76', deepWater: '#061a34', foam: '#76bddb', fog: '#162b4f', skyTop: '#060e24', skyMid: '#142644', horizon: '#764b76', exposure: 1.05 },
    [[0,-165],[66,-165],[121,-132],[129,-76],[73,-43],[52,4],[113,38],[143,91],[108,140],[45,154],[-10,113],[-56,72],[-114,90],[-151,39],[-143,-24],[-88,-64],[-86,-128],[-41,-163]]);
  const temple = make('sunken-temple', '失落环礁', 'SUNKEN TEMPLE', '穿过巨石环与断桥。借旋流甩出弯心，跳过古老堤墙，留住出弯速度。',
    { ...day, id: 'sunken-temple', label: '遗迹水道 / 借流 / 断桥', water: '#089f9f', deepWater: '#064c64', foam: '#cefff0', fog: '#80c5c4', skyTop: '#275c84', skyMid: '#62bfb4', horizon: '#efd4a1' },
    [[0,-168],[57,-158],[103,-121],[115,-69],[65,-26],[86,25],[139,58],[134,117],[74,152],[14,138],[-25,87],[-77,118],[-130,92],[-155,33],[-125,-22],[-151,-78],[-109,-132],[-56,-162]]);
  return {
    'breakwater': { ...breakwater,
      blocks: [...banks('cliff', 16, -1, 22, 32), ...banks('concrete', 5, 1, 13, 36), ...piers([.27, .72], 40),
        { id: 'spillway-wall', onRoute: true, progress: .21, lateralOffset: 0, width: 15, length: 3, height: 1.6, style: 'concrete' }],
      ramps: [{ id: 'spillway-launch', progress: .18, lateralOffset: 0, width: 12, length: 16, height: 3.2, launch: 11 },
        { id: 'dam-leap', progress: .68, lateralOffset: -4, width: 10, length: 13, height: 2.8, launch: 10 }],
      routes: [{ id: 'spillway-bypass', kind: 'safe', label: 'LOW WATER', hint: '低速可从外侧绕过堤墙', anchors: [[.145,0],[.175,16],[.22,17],[.25,0]] }],
    },
    'nightfall': { ...nightfall,
      blocks: [...banks('building', 20, -1, 27, 31), ...banks('building', 15, 1, 21, 37), ...piers([.16, .4, .69], 19)],
      shutters: [{ id: 'east-lock', progress: .21, period: 9, offset: 0 }, { id: 'metro-lock', progress: .48, period: 11, offset: 3 }, { id: 'home-lock', progress: .79, period: 8, offset: 5 }],
      ramps: [{ id: 'metro-launch', progress: .63, lateralOffset: 3, width: 10, length: 13, height: 2.6, launch: 9 }],
    },
    'sunken-temple': { ...temple,
      blocks: [...banks('ruin', 8, -1, 21, 32), ...banks('cliff', 12, 1, 10, 41),
        { id: 'temple-wall', onRoute: true, progress: .205, lateralOffset: 0, width: 14, length: 3, height: 1.5, style: 'ruin' }],
      currents: [{ id: 'temple-current', progress: .56, lateralOffset: 30, innerRadius: 10, outerRadius: 41, speed: 9, spin: 1 }],
      ramps: [{ id: 'temple-launch', progress: .177, lateralOffset: 0, width: 12, length: 14, height: 3, launch: 10 }],
      routes: [{ id: 'temple-bypass', kind: 'safe', label: 'OUTER REEF', hint: '从外侧绕行，不必飞跃', anchors: [[.14,0],[.17,16],[.22,16],[.25,0]] },
        { id: 'temple-current', kind: 'current', label: 'TIDAL LINE', hint: '切入发光水纹，顺流出弯', anchors: [[.48,0],[.515,13],[.55,20],[.585,13],[.62,0]] }],
    },
  };
}
