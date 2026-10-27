import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import { msim, useMaster } from '../../state/master';
import { mulberry32 } from '../../model/rng';
import { jetSpeedMs, thrustersFromDesign } from '../../model/master/thrust';
import { evaluate } from '../../model/hydrostatics';
import { bodyToWorld } from '../../model/master/solar';

const AMBIENT = 5200, JET = 2600, N = AMBIENT + JET;
const BOX = 11, DEPTH = 11; // particles live in a box about the node, metres
const STREAK_S = 0.45, MAX_STREAK = 1.6;
const OUTLET_M = 0.14;

/**
 * Suspended particles carried by the real flow: current + wave orbital motion + the plumes of each thruster.
 * Each one is drawn as a short streak along its velocity, so the water's direction of travel is readable.
 * Brightness and colour track the speed relative to the ambient current.
 */
export function FlowParticles() {
  const st = useMemo(() => {
    const rnd = mulberry32(2024);
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
    for (let i = 0; i < AMBIENT; i++) {
      pos[i * 3] = (rnd() * 2 - 1) * BOX; pos[i * 3 + 1] = -0.2 - rnd() * rnd() * DEPTH; pos[i * 3 + 2] = (rnd() * 2 - 1) * BOX;
    }
    for (let i = AMBIENT; i < N; i++) { life[i] = -rnd() * 3; pos[i * 3 + 1] = -50; }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 6), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(N * 6), 3));
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const lines = new LineSegments(geo, mat);
    lines.frustumCulled = false; lines.renderOrder = 12;
    return { pos, vel, life, geo, lines, rnd, nextJet: AMBIENT, acc: [0, 0, 0, 0] };
  }, []);
  const draft = useMemo(() => evaluate(msim.design, 'deployed').draftM, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * msim.params.physSpeed;
    const show = useMaster.getState().particles;
    st.lines.visible = show;
    if (!show || dt <= 0) return;
    const { pos, vel, life, rnd } = st;
    const t = msim.tPhys, sea = msim.sea, cx = msim.pos[0], cz = msim.pos[1];
    const cur = [msim.params.currentEastMs, 0, -msim.params.currentNorthMs];
    const att = msim.telemetry.att, th = thrustersFromDesign(msim.design, msim.params.layout);

    // jets: outlet in world space, direction the water leaves (opposite the force on the hull), speed from thrust.
    // Thruster parts sit 0.23 m above the keel bottom, which is `draft` below the waterline pivot.
    const jets = th.map((h, i) => {
      const u = msim.u[i] ?? 0, sg = Math.sign(u);
      const local = bodyToWorld(att, [h.x - h.ax * sg * OUTLET_M, 0.23 - draft, h.z - h.az * sg * OUTLET_M]);
      const dir = bodyToWorld(att, [-h.ax * sg, 0, -h.az * sg]);
      return { o: [cx + local[0], msim.telemetry.heaveM + local[1], cz + local[2]] as [number, number, number], d: dir, v: jetSpeedMs(u), on: Math.abs(u) > 0.4 };
    });

    // spawn jet particles in proportion to thrust
    jets.forEach((j, i) => {
      if (!j.on) return;
      st.acc[i] += dt * (60 + j.v * 260);
      while (st.acc[i] >= 1) {
        st.acc[i] -= 1;
        const k = st.nextJet; st.nextJet = st.nextJet + 1 >= N ? AMBIENT : st.nextJet + 1;
        const sp = 0.18;
        const d0 = [j.d[0] + (rnd() - 0.5) * sp, j.d[1] + (rnd() - 0.5) * sp, j.d[2] + (rnd() - 0.5) * sp];
        pos[k * 3] = j.o[0] + (rnd() - 0.5) * 0.05; pos[k * 3 + 1] = j.o[1] + (rnd() - 0.5) * 0.05; pos[k * 3 + 2] = j.o[2] + (rnd() - 0.5) * 0.05;
        vel[k * 3] = d0[0] * j.v * 1.5; vel[k * 3 + 1] = d0[1] * j.v * 1.5; vel[k * 3 + 2] = d0[2] * j.v * 1.5;
        life[k] = 1.8 + rnd() * 1.8;
      }
    });

    const posAttr = st.geo.attributes.position as BufferAttribute, colAttr = st.geo.attributes.color as BufferAttribute;
    const P = posAttr.array as Float32Array, C = colAttr.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const jet = i >= AMBIENT;
      if (jet) { if (life[i] <= 0) { P[i * 6 + 1] = P[i * 6 + 4] = -999; continue; } life[i] -= dt; }
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      // ambient field: current + deep-water orbital motion of the shared sea
      const orb = sea.orbital(x, y - 0, z, t);
      let fx = cur[0] + orb[0], fy = orb[1], fz = cur[2] + orb[2];
      // thruster plumes: axial jet that widens and weakens with distance
      for (const j of jets) {
        if (!j.on) continue;
        const rx = x - j.o[0], ry = y - j.o[1], rz = z - j.o[2];
        const s = rx * j.d[0] + ry * j.d[1] + rz * j.d[2];
        if (s < -0.1 || s > 9) continue;
        const r2 = rx * rx + ry * ry + rz * rz - s * s, b = 0.09 + 0.17 * Math.max(0, s);
        const g = (0.09 / b) * Math.exp(-r2 / (b * b)) * j.v * 1.4;
        fx += j.d[0] * g; fy += j.d[1] * g; fz += j.d[2] * g;
      }
      const relax = Math.min(1, dt / (jet ? 0.9 : 0.25));
      vel[i * 3] += (fx - vel[i * 3]) * relax; vel[i * 3 + 1] += (fy - vel[i * 3 + 1]) * relax; vel[i * 3 + 2] += (fz - vel[i * 3 + 2]) * relax;
      x += vel[i * 3] * dt; y += vel[i * 3 + 1] * dt; z += vel[i * 3 + 2] * dt;
      if (!jet) {
        if (y > -0.05) y = -0.05 - rnd() * 0.3;
        if (y < -DEPTH) y = -0.3 - rnd();
        // keep the cloud of particles centred on the node
        if (x - cx > BOX) x -= 2 * BOX; else if (x - cx < -BOX) x += 2 * BOX;
        if (z - cz > BOX) z -= 2 * BOX; else if (z - cz < -BOX) z += 2 * BOX;
      } else if (y > 0.5) life[i] = 0;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;

      const vx = vel[i * 3] - cur[0], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2] - cur[2];
      const sp = Math.hypot(vx, vy, vz), total = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
      const len = Math.min(MAX_STREAK, 0.03 + total * STREAK_S);
      const nx = vel[i * 3] / (total || 1), ny = vel[i * 3 + 1] / (total || 1), nz = vel[i * 3 + 2] / (total || 1);
      P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
      P[i * 6 + 3] = x - nx * len; P[i * 6 + 4] = y - ny * len; P[i * 6 + 5] = z - nz * len;
      // slow ambient flow is dim blue-white; fast jet water goes yellow-orange
      const hot = Math.min(1, sp / 1.4), fade = jet ? Math.min(1, life[i] * 1.2) : 1;
      const base = jet ? 0.32 : 0.05 + 0.13 * Math.min(1, total / 0.6);
      const r = (base + hot * 0.7) * fade, g = (base + hot * 0.38) * fade, b = (base * 0.9 + (1 - hot) * 0.3) * fade;
      C[i * 6] = r; C[i * 6 + 1] = g; C[i * 6 + 2] = b; C[i * 6 + 3] = r * 0.05; C[i * 6 + 4] = g * 0.05; C[i * 6 + 5] = b * 0.05;
    }
    posAttr.needsUpdate = true; colAttr.needsUpdate = true;
  });

  return <primitive object={st.lines} />;
}
