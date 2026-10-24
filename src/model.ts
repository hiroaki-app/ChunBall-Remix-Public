export const W = 1280;
export const H = 720;
export const GRAIN_R = 4.2;
export const BALL_MASS = 1;
export const GEAR_PLACE_R = 28;
export const GEAR_LAUNCH_RS = [18, 28, 40] as const;
export const GEAR_BASE_OMEGA = 2.2;
export const ERASER_R = 32;
export const PLACED_BELT_R = 14;
export const MIN_PLACED_BELT_LEN = 56;
export const MAX_PLACED_GEARS = 80;
export const MAX_PLACED_GATES = 24;
export const MAX_RECV_TRUCK_STOPS = 12;
export const MAX_PLACED_SEGS = 480;
export const MAX_PARTICLES = 420;
export const BLOWER_RANGE = 640;
export const BLOWER_FORCE = 780;
export const BLOWER_CONE = 0.42;
export const DEBUG_PATHS = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("debug");
export type SpinKind = "gear" | "roller" | "pulley" | "drum";
export type Belt = {
    id: string;
    speed: number;
    travel: number;
    outerR: number;
};
export type Tool = "line" | "belt" | "freeBelt" | "truckStop";
export type StageId = "sewer" | "free" | "sandbox" | "wash";
export type RecvTruckStatus = "uncalled" | "approaching" | "waiting" | "departing";
export type RecvTruckCargo = {
    id: number;
    lx: number;
    ly: number;
};
export type RecvTruckStop = {
    id: number;
    inletX: number;
    inletY: number;
};
export type RecvTruck = {
    id: number;
    targetId: number;
    status: RecvTruckStatus;
    x: number;
    y: number;
    targetInletX: number;
    targetInletY: number;
    cargo: RecvTruckCargo[];
};
export type Vec = {
    x: number;
    y: number;
};
export type Segment = {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    conveyor: number;
    placed: boolean;
    draw: boolean;
    pass: "all";
    tag?: "cleanDeck" | "recvTruck" | "placedGate" | "washFloor" | "washWallL" | "washWallR" | "washCeiling";
    belt?: string;
    stroke?: number;
    freeBelt?: number;
};
export type EraserHit = {
    kind: "gear";
    id: number;
} | {
    kind: "stroke";
    id: number;
} | {
    kind: "belt";
    id: string;
} | {
    kind: "freeBelt";
    id: number;
} | {
    kind: "blower";
    id: number;
} | {
    kind: "gate";
    id: number;
} | {
    kind: "truckStop";
    id: number;
};
export type Gate = {
    id: number;
    x: number;
    y: number;
    angle: number;
    open: boolean;
    solid: boolean;
    slide: number;
};
export type Blower = {
    id: number;
    x: number;
    y: number;
    angle: number;
    range: number;
    force: number;
    cone: number;
    placed: boolean;
    mode: "planar";
};
export type Gear = {
    motorKind?: "motor" | "follower";
    frictionContact?: boolean;
    motorFrictionContact?: boolean;
    speedLevel?: 1 | 2 | 3 | 4 | 5;
    id: number;
    x: number;
    y: number;
    r: number;
    angle: number;
    omega: number;
    drive: number;
    drivePriority: number;
    driveSeq: number;
    placed: boolean;
    spin: SpinKind;
    belt?: string;
    washBuiltIn?: boolean;
    washLinked?: boolean;
};
export type ParticleKind = "grain" | "other";
export type Particle = {
    id: number;
    kind: ParticleKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    frozen: boolean;
    sleeping: boolean;
    sleepTime: number;
    standing: boolean;
    stem: number;
    angle: number;
    marked: boolean;
    color: string;
    trackId: string | null;
};
export type Rotator = {
    x: number;
    y: number;
    r: number;
    collideR: number;
    angle: number;
    omega: number;
};
export type FlowZone = {
    kind: "swirl" | "sink" | "suck" | "push";
    x: number;
    y: number;
    r: number;
    force: number;
    ox: number;
    oy: number;
};
export type World = {
    stage: StageId;
    nextId: number;
    segments: Segment[];
    gears: Gear[];
    particles: Particle[];
    zones: FlowZone[];
    drum: Rotator;
    blowers: Blower[];
    gates: Gate[];
    belts: Belt[];
    freeBelts?: import("./freeBelt").FreeBelt[];
    spawnAcc: number;
    time: number;
    recvTrucks: RecvTruck[];
    recvTruckStops: RecvTruckStop[];
    sandbox?: {
        released: boolean;
        refillWait: number;
    };
    wash?: import("./wash").WashState;
};
export function hypot2(dx: number, dy: number): number {
    return dx * dx + dy * dy;
}
export function clamp(v: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, v));
}
