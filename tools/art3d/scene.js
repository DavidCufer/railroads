import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Q.get(k).split(",").map(Number) : d);
const SIZE = num("size", [1024])[0];
const W = num("w", [SIZE])[0],
  H = num("h", [SIZE])[0];
const T = Q.has("t") ? Number(Q.get("t")) : null; // animation time (s); null = the still
const D_APPROACH = 55,
  T_STOP = 3.6;
const zAt = (t) =>
  t >= T_STOP
    ? 0
    : -D_APPROACH * Math.pow(1 - Math.max(t, 0) / T_STOP, 2) -
      (t < 0 ? (-t * 2 * D_APPROACH) / T_STOP : 0);
const CAM = num("cam", [0.0, 1.0, 13.5]);
const LOOK = num("look", [0, 2.15, -3]);
const FOV = num("fov", [27])[0];
const BG = Q.get("bg") || "night"; // night | crest (transparent background)

// seeded random
let seed = 7;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  alpha: BG === "crest",
});
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(Q.get("exp") || 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 400);
camera.position.set(...CAM);
camera.lookAt(...LOOK);

// ---------- sky (equirect canvas) used for background + reflections ----------
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#020405");
  gr.addColorStop(0.3, "#060c0e");
  gr.addColorStop(0.44, "#111b1c");
  gr.addColorStop(0.48, "#2a2418");
  gr.addColorStop(0.497, "#7a5228");
  gr.addColorStop(0.503, "#221a12");
  gr.addColorStop(0.53, "#0c0a08");
  gr.addColorStop(1, "#030303");
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 512);
  // warmer patch of glow behind the engine (the direction the engine comes from: -z = u 0.75)
  const rg = g.createRadialGradient(768, 255, 5, 768, 255, 150);
  rg.addColorStop(0, "rgba(255,150,60,.28)");
  rg.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 1024, 512);
  // moon, high behind-left
  g.fillStyle = "rgba(230,240,255,.9)";
  g.beginPath();
  g.arc(640, 110, 6, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sky = skyTexture();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(sky).texture;
scene.environmentIntensity = 0.9;
if (BG === "night") {
  scene.background = sky;
  scene.fog = new THREE.FogExp2(0x070b0c, 0.03);
}

// ---------- materials ----------
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const M = {
  black: phys({
    color: 0x111213,
    roughness: 0.34,
    metalness: 0.5,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
  }),
  satin: phys({ color: 0x101112, roughness: 0.6, metalness: 0.3 }),
  green: phys({
    color: 0x1c4c36,
    roughness: 0.32,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  }),
  red: phys({
    color: 0x861c12,
    roughness: 0.3,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  }),
  brass: phys({ color: 0xd6a842, roughness: 0.2, metalness: 1 }),
  copper: phys({ color: 0xc06a3c, roughness: 0.24, metalness: 1 }),
  steel: phys({ color: 0xc8ced1, roughness: 0.3, metalness: 1 }),
  dsteel: phys({ color: 0x5c6164, roughness: 0.32, metalness: 1 }),
  rail: phys({ color: 0x8f9699, roughness: 0.42, metalness: 1 }),
  railside: phys({ color: 0x3b302a, roughness: 0.8, metalness: 0.4 }),
  wood: phys({ color: 0x2b1f16, roughness: 0.95, envMapIntensity: 0.2 }),
  ballast: new THREE.MeshLambertMaterial({ color: 0x050404 }),
  rubber: phys({ color: 0x0b0b0b, roughness: 0.7 }),
  glass: phys({ color: 0xffb060, emissive: 0xff8a2a, emissiveIntensity: 0.25, roughness: 0.1 }),
  lens: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};
const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
const cylZ = (r, len, seg = 48) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const cylX = (r, len, seg = 48) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const lathe = (pts, seg = 64) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

// ---------- track ----------
const GA = 0.75; // half gauge, rail centre (m)
for (const s of [-1, 1]) {
  add(box(0.075, 0.05, 90), M.rail, s * GA, -0.025, -20);
  add(box(0.02, 0.09, 90), M.railside, s * GA, -0.095, -20);
  add(box(0.15, 0.02, 90), M.railside, s * GA, -0.15, -20);
}
for (let z = 18; z > -60; z -= 0.72)
  add(box(2.6, 0.14, 0.26), M.wood, (rnd() - 0.5) * 0.06, -0.23, z + (rnd() - 0.5) * 0.04);
add(new THREE.PlaneGeometry(4.2, 90).rotateX(-Math.PI / 2), M.ballast, 0, -0.3, -20);
add(
  new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x050403 }),
  0,
  -0.42,
  -60,
);

// ---------- engine ----------
const E = new THREE.Group();
scene.add(E);
const PL = 1.35; // running plate top
// buffer beam
add(box(2.6, 0.46, 0.16), M.red, 0, 1.08, 0.0, E);
add(box(2.6, 0.04, 0.17), M.black, 0, 0.86, 0.0, E); // bottom edge
// buffers
for (const s of [-1, 1]) {
  const x = s * 0.87,
    y = 1.08;
  add(box(0.36, 0.36, 0.03), M.black, x, y, 0.095, E); // flange plate
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    add(new THREE.SphereGeometry(0.018, 10, 8), M.dsteel, x + dx * 0.14, y + dy * 0.14, 0.115, E);
  add(cylZ(0.12, 0.2), M.black, x, y, 0.2, E); // housing
  add(
    new THREE.CylinderGeometry(0.11, 0.13, 0.04, 40).rotateX(Math.PI / 2),
    M.black,
    x,
    y,
    0.12,
    E,
  );
  add(cylZ(0.07, 0.12), M.steel, x, y, 0.34, E); // plunger
  const head = lathe(
    [
      [0, 0.05],
      [0.12, 0.045],
      [0.2, 0.03],
      [0.215, 0.0],
      [0.2, -0.01],
      [0, -0.01],
    ],
    64,
  ).rotateX(Math.PI / 2);
  add(head, M.steel, x, y, 0.41, E);
}
// coupling hook + the plough (cow-catcher) in front of the buffer beam
add(box(0.09, 0.2, 0.08), M.black, 0, 1.0, 0.12, E);
add(new THREE.TorusGeometry(0.06, 0.02, 10, 24, Math.PI), M.dsteel, 0, 0.92, 0.17, E).rotation.set(
  0,
  0,
  Math.PI,
);
const bar = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a),
    B = new THREE.Vector3(...b),
    d = B.clone().sub(A);
  const m = add(new THREE.CylinderGeometry(r, r, d.length(), 12), mat, 0, 0, 0, E);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
if (Q.get("plough") !== "0") {
  const TOP = 0.8,
    BOT = 0.07,
    HW = 1.2,
    TZ = 0.12,
    NOSE = 1.75,
    SIDEZ = 0.45;
  bar([-HW, TOP, TZ], [HW, TOP, TZ], 0.05, M.red);
  for (const s of [-1, 1]) {
    bar([0, BOT, NOSE], [s * HW, BOT, SIDEZ], 0.035, M.dsteel);
    bar([s * HW, TOP, TZ], [s * HW, BOT, SIDEZ], 0.035, M.black);
  }
  bar([0, TOP, TZ + 0.05], [0, BOT, NOSE], 0.045, M.black);
  const N = 10;
  for (const s of [-1, 1])
    for (let i = 1; i < N; i++) {
      const f = i / N;
      const m = bar(
        [s * HW * f, TOP - 0.02, TZ + 0.03],
        [s * HW * f * 1.0, BOT + 0.02, NOSE + (SIDEZ - NOSE) * f],
        0.02,
        M.black,
      );
      m.scale.set(1.8, 1, 0.7);
    }
} else {
  for (let i = 0; i < 3; i++) {
    const l = add(
      new THREE.TorusGeometry(0.055, 0.016, 8, 20),
      M.dsteel,
      0,
      0.84 - i * 0.09,
      0.19 + i * 0.01,
      E,
    );
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    l.scale.set(0.7, 1.2, 1);
  }
}
// running plate + valances
add(box(2.62, 0.05, 9.4), M.black, 0, PL - 0.025, -4.6, E);
for (const s of [-1, 1]) {
  add(box(0.04, 0.22, 9.3), M.black, s * 1.3, PL - 0.13, -4.6, E);
  add(box(0.012, 0.03, 9.3), M.brass, s * 1.322, PL - 0.06, -4.6, E);
}
// frames
for (const s of [-1, 1]) add(box(0.05, 0.75, 10), M.black, s * 0.56, 0.95, -4.9, E);
// wheels
const WHEELS = [];
function wheel(r, x, z, paint, spokes) {
  const g = new THREE.Group();
  g.position.set(x, r, z);
  E.add(g);
  WHEELS.push([g, r]);
  const side = Math.sign(x);
  const tyre = lathe(
    [
      [r - 0.07, -0.07],
      [r - 0.005, -0.07],
      [r, -0.03],
      [r, 0.07],
      [r + 0.04, 0.07],
      [r + 0.04, 0.1],
      [r - 0.07, 0.1],
    ],
    72,
  ).rotateZ((-side * Math.PI) / 2);
  add(tyre, M.steel, 0, 0, 0, g);
  const rim = lathe(
    [
      [r - 0.12, -0.05],
      [r - 0.07, -0.05],
      [r - 0.07, 0.07],
      [r - 0.12, 0.07],
    ],
    72,
  ).rotateZ(Math.PI / 2);
  add(rim, paint, 0, 0, 0, g);
  add(cylX(r * 0.2, 0.16, 32), paint, 0, 0, 0, g);
  add(cylX(r * 0.08, 0.22, 24), M.steel, side * 0.01, 0, 0, g);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const L = r - 0.1 - r * 0.18;
    const sp = add(
      new THREE.CylinderGeometry(0.018 + r * 0.008, 0.03 + r * 0.012, L, 10),
      paint,
      0,
      0,
      0,
      g,
    );
    sp.scale.set(0.6, 1, 1);
    sp.position.set(0, Math.cos(a) * (r * 0.18 + L / 2), Math.sin(a) * (r * 0.18 + L / 2));
    sp.rotation.x = a;
  }
  return g;
}
for (const z of [-1.1, -3.0]) {
  for (const s of [-1, 1]) wheel(0.48, s * GA, z, M.black, 10);
  add(cylX(0.07, 1.5), M.dsteel, 0, 0.48, z, E);
}
for (const z of [-5.0, -7.5]) {
  for (const s of [-1, 1]) wheel(1.0, s * GA, z, M.green, 18);
  add(cylX(0.1, 1.5), M.dsteel, 0, 1.0, z, E);
}
// bogie frame
for (const s of [-1, 1]) add(box(0.06, 0.25, 2.8), M.black, s * 0.5, 0.5, -2.05, E);
// splashers over the driving wheels
for (const z of [-5.0, -7.5])
  for (const s of [-1, 1]) {
    add(
      new THREE.CylinderGeometry(1.08, 1.08, 0.22, 64, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
      M.green,
      s * 0.8,
      1.0,
      z,
      E,
    );
    add(
      new THREE.TorusGeometry(1.08, 0.018, 8, 64, Math.PI).rotateY(Math.PI / 2),
      M.brass,
      s * 0.92,
      1.0,
      z,
      E,
    ).rotation.set(0, 0, 0);
  }
// saddle + smokebox
const SB = 2.2,
  SR = 0.82;
add(box(1.3, 0.6, 1.2), M.black, 0, PL + 0.3, -1.0, E);
add(cylZ(SR, 1.4, 72), M.black, 0, SB, -1.0, E);
add(cylZ(SR + 0.025, 0.06, 72), M.black, 0, SB, -0.3, E); // front ring
for (let i = 0; i < 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  add(
    new THREE.SphereGeometry(0.02, 10, 8),
    M.black,
    Math.cos(a) * 0.76,
    SB + Math.sin(a) * 0.76,
    -0.265,
    E,
  );
}
// door (dished)
add(
  lathe(
    [
      [0, 0.13],
      [0.25, 0.115],
      [0.48, 0.07],
      [0.62, 0.02],
      [0.66, 0.0],
      [0.67, -0.02],
      [0, -0.02],
    ],
    72,
  ).rotateX(Math.PI / 2),
  M.black,
  0,
  SB,
  -0.27,
  E,
);
add(new THREE.TorusGeometry(0.665, 0.022, 10, 72), M.dsteel, 0, SB, -0.265, E);
// hinge straps
for (const dy of [-0.3, 0.3]) {
  const st = add(
    box(0.95, 0.07, 0.025),
    M.black,
    -0.25,
    SB + dy,
    -0.15 + (Math.abs(dy) > 0 ? -0.02 : 0),
    E,
  );
  st.rotation.y = 0.0;
  add(cylZ(0.05, 0.05), M.black, -0.7, SB + dy, -0.2, E);
}
// dart: hub + two handles
add(cylZ(0.07, 0.06), M.steel, 0, SB, -0.12, E);
add(box(0.42, 0.045, 0.03), M.dsteel, 0, SB, -0.09, E).rotation.z = 0.35;
add(box(0.3, 0.04, 0.03), M.dsteel, 0, SB, -0.07, E).rotation.z = -0.35;
// number plate
{
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "#1a1410";
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = "#e0b860";
  g.lineWidth = 12;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = "#f0c870";
  g.font = "bold 120px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("1830", 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mats = [
    M.brass,
    M.brass,
    M.brass,
    M.brass,
    phys({ map: t, roughness: 0.3, metalness: 0.7 }),
    M.brass,
  ];
  add(box(0.44, 0.14, 0.03), mats, 0, SB + 0.4, -0.18, E);
}
// handrail over the smokebox front and along the boiler
{
  const pts = [];
  for (const s of [-1, 1]) {
  }
  const c = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.95, 2.5, -7.4),
      new THREE.Vector3(-0.95, 2.5, -1.6),
      new THREE.Vector3(-0.92, 2.55, -0.6),
      new THREE.Vector3(-0.7, 2.85, -0.22),
      new THREE.Vector3(0, 3.02, -0.18),
      new THREE.Vector3(0.7, 2.85, -0.22),
      new THREE.Vector3(0.92, 2.55, -0.6),
      new THREE.Vector3(0.95, 2.5, -1.6),
      new THREE.Vector3(0.95, 2.5, -7.4),
    ],
    false,
    "catmullrom",
    0.2,
  );
  add(new THREE.TubeGeometry(c, 200, 0.018, 8), M.steel, 0, 0, 0, E);
}
// boiler + bands
add(cylZ(0.72, 6.0, 72), M.green, 0, SB + 0.03, -4.7, E);
for (const z of [-1.75, -3.3, -4.9, -6.4, -7.6])
  add(new THREE.TorusGeometry(0.725, 0.018, 8, 72), M.brass, 0, SB + 0.03, z, E);
// chimney (copper cap)
add(
  lathe(
    [
      [0.5, -0.25],
      [0.46, 0.0],
      [0.36, 0.08],
      [0.28, 0.2],
      [0.26, 0.4],
      [0.26, 0.72],
      [0.2, 0.72],
      [0.2, -0.25],
    ],
    64,
  ),
  M.black,
  0,
  SB + SR - 0.05,
  -1.0,
  E,
);
add(
  lathe(
    [
      [0.26, 0.7],
      [0.3, 0.78],
      [0.34, 0.86],
      [0.345, 0.95],
      [0.32, 0.97],
      [0.22, 0.97],
      [0.22, 0.7],
    ],
    64,
  ),
  M.copper,
  0,
  SB + SR - 0.05,
  -1.0,
  E,
);
add(
  new THREE.CylinderGeometry(0.22, 0.22, 0.02, 40),
  new THREE.MeshBasicMaterial({ color: 0x050505 }),
  0,
  SB + SR - 0.05 + 0.965,
  -1.0,
  E,
);
// dome + safety valves
add(
  lathe(
    [
      [0.44, -0.2],
      [0.42, 0.06],
      [0.38, 0.28],
      [0.3, 0.46],
      [0.18, 0.56],
      [0, 0.6],
    ],
    64,
  ),
  M.brass,
  0,
  SB + 0.7,
  -4.6,
  E,
);
add(
  lathe(
    [
      [0.2, -0.15],
      [0.18, 0.05],
      [0.14, 0.18],
      [0.16, 0.34],
      [0.1, 0.42],
      [0, 0.44],
    ],
    48,
  ),
  M.brass,
  0,
  SB + 0.72,
  -7.1,
  E,
);
// lamp on top of the smokebox
const LAMP = new THREE.Vector3(0, SB + 0.66, -0.05);
add(box(0.3, 0.34, 0.26), M.black, LAMP.x, LAMP.y, LAMP.z - 0.05, E);
add(
  lathe(
    [
      [0.1, 0],
      [0.07, 0.08],
      [0.05, 0.12],
      [0, 0.13],
    ],
    24,
  ),
  M.black,
  LAMP.x,
  LAMP.y + 0.17,
  LAMP.z - 0.05,
  E,
);
add(cylZ(0.13, 0.05, 40), M.brass, LAMP.x, LAMP.y - 0.01, LAMP.z + 0.1, E);
add(cylZ(0.1, 0.02, 40), M.lens, LAMP.x, LAMP.y - 0.01, LAMP.z + 0.13, E).castShadow = false;
// cab
{
  const sh = new THREE.Shape();
  sh.moveTo(-1.28, 0);
  sh.lineTo(1.28, 0);
  sh.lineTo(1.28, 1.95);
  sh.quadraticCurveTo(1.2, 2.3, 0, 2.38);
  sh.quadraticCurveTo(-1.2, 2.3, -1.28, 1.95);
  sh.lineTo(-1.28, 0);
  for (const s of [-1, 1]) {
    const h = new THREE.Path();
    h.absarc(s * 0.95, 1.72, 0.2, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
  add(g, M.green, 0, PL, -7.7, E);
  for (const s of [-1, 1]) {
    add(new THREE.CircleGeometry(0.2, 40), M.glass, s * 0.95, PL + 1.72, -7.69, E).castShadow =
      false;
    add(new THREE.TorusGeometry(0.21, 0.025, 10, 40), M.brass, s * 0.95, PL + 1.72, -7.64, E);
  }
  add(box(2.8, 0.06, 2.6), M.black, 0, PL + 2.42, -8.8, E);
  for (const s of [-1, 1]) add(box(0.05, 2.0, 2.2), M.green, s * 1.28, PL + 1.0, -8.8, E);
  const fire = new THREE.PointLight(0xff7a2a, 6, 4, 2);
  fire.position.set(0, PL + 1.2, -8.4);
  E.add(fire);
}
// tender behind
add(box(2.6, 1.9, 5), M.green, 0, PL + 0.7, -12.6, E);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x2b3d40, 0x0a0806, 0.25));
const key = new THREE.SpotLight(0xffe3c0, 420, 60, 0.3, 0.6, 1.4);
key.position.set(-6, 7.5, 8);
key.target.position.set(0, 2.2, -1);
scene.add(key, key.target);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(0xa9c4dc, 3.2);
rim.position.set(5, 7, -12);
const rim2 = new THREE.DirectionalLight(0xffb070, 2.0);
rim2.position.set(-6, 3, -12);
scene.add(rim2);
scene.add(rim);
const warm = new THREE.DirectionalLight(0xffa860, 1.2);
warm.position.set(-4, 2, -20);
scene.add(warm);
const head = new THREE.SpotLight(0xfff2d8, 160, 50, 0.38, 0.6, 1.5);
head.position.copy(LAMP).add(new THREE.Vector3(0, 0, 0.2));
head.target.position.set(0, -0.2, 30);
E.add(head, head.target);
const nearPt = new THREE.PointLight(0xffe0b0, 3, 3, 2);
nearPt.position.copy(LAMP).add(new THREE.Vector3(0, 0, 0.6));
E.add(nearPt);

// ---------- steam ----------
function puffTexture(variant) {
  // a cauliflower billow: overlapping lit spheres (light from upper left), soft edges
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.filter = "blur(11px)";
  const n = 7 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2,
      d = rnd() * 52;
    const x = 128 + Math.cos(a) * d,
      y = 128 + Math.sin(a) * d * 0.8,
      r = 34 + rnd() * 34;
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.95)");
    gr.addColorStop(0.5, "rgba(214,214,214,.85)");
    gr.addColorStop(0.8, "rgba(160,160,160,.45)");
    gr.addColorStop(1, "rgba(130,130,130,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const puffs = Array.from({ length: 8 }, (_, i) => puffTexture(i));
const CH = new THREE.Vector3(0, SB + SR + 0.95, -1.0);
const NSTEAM = Number(Q.get("steam") || 220);
const SOP = Number(Q.get("sop") || 0.8);
for (let i = 0; T === null && i < NSTEAM; i++) {
  const t = Math.pow(i / NSTEAM, 1.2);
  // rises out of the chimney, then rolls back over the engine and spreads
  const up = 0.15 + 3.6 * Math.sqrt(t) + t * 1.2 + (rnd() - 0.5) * (0.25 + t),
    back = t * t * 10 + rnd() * t * 2;
  const spread = 0.3 + t * 3.0;
  const x = (rnd() - 0.5) * spread * 1.6 + t * t * 1.5;
  const pos = CH.clone().add(new THREE.Vector3(x, up + (rnd() - 0.5) * spread * 0.5, -back));
  const shade = (0.55 + 0.3 * rnd()) * (1 - 0.3 * t);
  const col = new THREE.Color().setRGB(shade, shade * 0.98, shade * 0.95);
  const mat = new THREE.SpriteMaterial({
    map: puffs[i % 8],
    color: col,
    transparent: true,
    opacity: SOP * (0.75 - t * 0.3),
    depthWrite: false,
    fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  const sc = (0.85 + t * 4.0) * (0.75 + rnd() * 0.6);
  s.scale.set(sc, sc, 1);
  s.renderOrder = 10 + (NSTEAM - i);
  scene.add(s);
}
// glow halo around the lamp lens
{
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,250,235,1)");
  gr.addColorStop(0.08, "rgba(255,236,190,.85)");
  gr.addColorStop(0.3, "rgba(255,190,110,.25)");
  gr.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: t,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      fog: false,
    }),
  );
  s.position.copy(LAMP).add(new THREE.Vector3(0, -0.01, 0.4));
  const g2 = Number(Q.get("halo") || 1.0);
  s.scale.set(g2, g2, 1);
  s.renderOrder = 999;
  E.add(s);
}

// ---------- animation: the engine runs in and stops; steam puffs are born at the chimney and left behind ----------
if (T !== null) {
  const ez = zAt(T);
  E.position.z = ez;
  for (const [g, r] of WHEELS) g.rotation.x = (ez + D_APPROACH) / r;
  const hash = (n) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const DT = 0.04,
    LIFE = 5.0;
  for (let i = Math.floor(-2.5 / DT); i * DT <= T; i++) {
    const b = i * DT,
      a = T - b;
    if (a > LIFE) continue;
    const r1 = hash(i * 7 + 1),
      r2 = hash(i * 7 + 2),
      r3 = hash(i * 7 + 3),
      r4 = hash(i * 7 + 4),
      r5 = hash(i * 7 + 5);
    const speed = b < T_STOP ? ((2 * D_APPROACH) / T_STOP) * (1 - Math.max(b, 0) / T_STOP) : 0; // engine speed at birth
    const up = 2.4 * (1 - Math.exp(-a / (0.7 + speed * 0.02))) + 0.3 * a;
    const pos = new THREE.Vector3(
      (r1 - 0.5) * (0.25 + 1.4 * a) + 0.35 * a,
      CH.y + up + (r2 - 0.5) * (0.2 + 0.5 * a),
      CH.z + zAt(b) - 1.1 * a,
    );
    const tt = Math.min(1, a / 4);
    const shade = (0.55 + 0.3 * r3) * (1 - 0.3 * tt);
    const mat = new THREE.SpriteMaterial({
      map: puffs[i & 7],
      color: new THREE.Color().setRGB(shade, shade * 0.98, shade * 0.95),
      transparent: true,
      opacity: SOP * 0.75 * Math.min(1, a / 0.15) * Math.max(0, 1 - a / LIFE),
      depthWrite: false,
      fog: false,
      rotation: r5 * 6.28,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    const sc = (0.75 + 1.25 * a) * (0.75 + 0.6 * r4);
    sp.scale.set(sc, sc, 1);
    scene.add(sp);
  }
}

// ---------- render ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(new THREE.Vector2(W, H), Number(Q.get("bloom") || 0.35), 0.5, 0.9),
);
composer.addPass(new OutputPass());
if (BG === "crest") renderer.render(scene, camera);
else composer.render();
window.done = renderer.domElement.toDataURL("image/png");
