// Marigold bush: a clump of stems from one base, pinnate leaves along them
// and a ruffled pompom on every tip.
//
//   setGrowth(0..1)  stems rise, leaves unfurl as the stem passes them,
//                    green buds form at the tips
//   setBloom(0..1)   petals push out of the buds, outer rows first, until
//                    every head is a full ball (heads open slightly staggered)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../shared/app.js';

export function createBush({ scene, settings: PARAMS }) {
  const bush = new THREE.Group();
  scene.add(bush);

  const bushRandom = seededRandom(PARAMS.bush.seed);
  const rand = (min, max) => min + (max - min) * bushRandom();
  const smooth = (t) => t * t * (3 - 2 * t);
  const UP = new THREE.Vector3(0, 1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  const keyLight = new THREE.DirectionalLight(0xffe6cc, 1.15);
  keyLight.position.set(2, 5, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffb070, 0.6);
  rimLight.position.set(-4, 2, -3);
  scene.add(rimLight);

  const stemMaterial = new THREE.MeshStandardMaterial({
    color: PARAMS.bush.stemColor, roughness: 0.7,
    emissive: PARAMS.bush.stemColor, emissiveIntensity: 0.15 });
  const leafMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
    emissive: PARAMS.leaves.glowColor });
  const calyxMaterial = new THREE.MeshStandardMaterial({
    color: PARAMS.heads.calyxColor, roughness: 0.65,
    emissive: PARAMS.heads.calyxColor, emissiveIntensity: 0.12 });
  const petalMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, side: THREE.DoubleSide,
    emissive: PARAMS.heads.glowColor, emissiveIntensity: PARAMS.heads.glow });

  /* ---- leaves ---------------------------------------------------------- */

  // one narrow serrated leaflet, length along +x, lying flat in the xz plane
  function buildLeaflet(length, width, tint) {
    const teeth = 6;
    const steps = teeth * 2;
    const outline = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const notch = i % 2 ? 1 : 0.72;            // saw-tooth edge
      outline.push([t * length, 0.5 * width * Math.sin(Math.PI * Math.pow(t, 0.7)) * notch]);
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (const [x, y] of outline) shape.lineTo(x, y);
    for (let i = outline.length - 2; i > 0; i--) shape.lineTo(outline[i][0], -outline[i][1]);
    shape.lineTo(0, 0);

    const geometry = new THREE.ShapeGeometry(shape, 2);
    geometry.rotateX(-Math.PI / 2);

    const dark = new THREE.Color(PARAMS.leaves.colorDark);
    const light = new THREE.Color(PARAMS.leaves.colorLight);
    const position = geometry.attributes.position;
    const colors = [];
    const vertexColor = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      // lighter down the middle vein and toward the tip
      const vein = 1 - Math.min(1, Math.abs(z) / (0.5 * width));
      vertexColor.copy(dark).lerp(light, Math.min(1, 0.15 + 0.35 * (x / length) + 0.35 * vein * vein + tint));
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      // little cup across the leaflet
      position.setY(i, position.getY(i) + 0.9 * z * z);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  }

  // full leaf: midrib along +x with leaflet pairs angled forward, then drooped
  function buildLeaf(length) {
    const parts = [];
    const pairs = PARAMS.leaves.leafletPairs;
    for (let pairIndex = 0; pairIndex < pairs; pairIndex++) {
      const t = 0.14 + 0.8 * (pairIndex / pairs);
      const size = 0.38 + 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.05));   // biggest mid-leaf
      for (const side of [-1, 1]) {
        const leaflet = buildLeaflet(length * 0.34 * size, length * 0.105 * size, rand(-0.08, 0.08));
        leaflet.rotateY(side * THREE.MathUtils.degToRad(rand(48, 62)));
        leaflet.translate(t * length, 0, 0);
        parts.push(leaflet);
      }
    }
    const tipLeaflet = buildLeaflet(length * 0.24, length * 0.085, 0.05);
    tipLeaflet.translate(0.93 * length, 0, 0);
    parts.push(tipLeaflet);

    const rib = new THREE.CylinderGeometry(0.004, 0.008, length, 4, 1);
    rib.rotateZ(-Math.PI / 2);
    rib.translate(length / 2, 0, 0);
    rib.deleteAttribute('uv');
    const ribColor = new THREE.Color(PARAMS.leaves.colorLight);
    rib.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: rib.attributes.position.count * 3 },
        (_, i) => [ribColor.r, ribColor.g, ribColor.b][i % 3]), 3));
    parts.push(rib);

    const leaf = mergeGeometries(parts);
    const position = leaf.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) / length;
      position.setY(i, position.getY(i) - 0.32 * length * x * x);   // arch and droop
    }
    leaf.computeVertexNormals();
    return leaf;
  }

  const leafShapes = [buildLeaf(1), buildLeaf(1), buildLeaf(1)];

  /* ---- flower heads ---------------------------------------------------- */

  // ruffled fan-shaped petal: base at y=0, tip at y=1, width along x
  function buildPetal() {
    const geometry = new THREE.PlaneGeometry(1, 1, 10, 6);
    geometry.translate(0, 0.5, 0);
    const position = geometry.attributes.position;
    const deep = new THREE.Color(PARAMS.heads.colorDeep);
    const bright = new THREE.Color(PARAMS.heads.colorBright);
    const vertexColor = new THREE.Color();
    const colors = [];
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i);           // -0.5 .. 0.5 across
      let v = position.getY(i);             // 0 .. 1 along
      const fan = 0.3 + 0.7 * Math.sin(Math.min(1, v * 1.5) * Math.PI / 2);
      const x = u * fan;
      v += 0.07 * Math.sin(u * Math.PI * 5) * v * v * v;            // scalloped edge
      let z = -0.42 * u * u;                                         // cupped
      z += 0.07 * Math.sin(u * 15 + v * 5) * v * v;                  // ruffles
      z += 0.18 * v * v;                                             // tips flare out
      position.setXYZ(i, x, v, z);
      vertexColor.copy(deep).lerp(bright, Math.min(1, Math.pow(v, 1.6) * 1.15));
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  const petalShape = buildPetal();

  function buildCalyx() {
    const profile = [
      new THREE.Vector2(0.0, -0.2), new THREE.Vector2(0.03, -0.19),
      new THREE.Vector2(0.06, -0.12), new THREE.Vector2(0.085, -0.02),
      new THREE.Vector2(0.095, 0.04), new THREE.Vector2(0.088, 0.06),
    ];
    const geometry = new THREE.LatheGeometry(profile, 20);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      const ridge = 1 + 0.08 * Math.cos(5 * Math.atan2(z, x));     // five ribs
      position.setX(i, x * ridge);
      position.setZ(i, z * ridge);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  const calyxShape = buildCalyx();

  const heads = [];

  function buildHead(tipPosition, axis, headIndex) {
    const conf = PARAMS.heads;
    const group = new THREE.Group();
    group.position.copy(tipPosition);
    group.quaternion.setFromUnitVectors(UP, axis);
    bush.add(group);

    const calyx = new THREE.Mesh(calyxShape, calyxMaterial);
    calyx.position.y = 0.04;
    group.add(calyx);

    const petals = new THREE.InstancedMesh(petalShape, petalMaterial, conf.petals);
    petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(petals);

    const radius = conf.radius;
    const maxPolar = THREE.MathUtils.degToRad(conf.maxPolarDeg);
    const ballCenter = new THREE.Vector3(0, 0.1 + radius * 0.62, 0);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const petalData = [];
    const instanceColor = new THREE.Color();

    for (let i = 0; i < conf.petals; i++) {
      // fibonacci spread over a dome that wraps past the equator
      const along = (i + 0.5) / conf.petals;
      const polar = Math.acos(1 - along * (1 - Math.cos(maxPolar)));
      const azimuth = i * golden + rand(-0.15, 0.15);
      const direction = new THREE.Vector3(
        Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth));
      const roll = rand(0, Math.PI * 2);
      const rank = polar / maxPolar;                // 0 = top center, 1 = outer skirt

      const openQuat = new THREE.Quaternion().setFromUnitVectors(UP, direction)
        .multiply(scratchQuat.setFromAxisAngle(UP, roll));
      const closedDir = direction.clone().lerp(UP, 0.88).normalize();
      const closedQuat = new THREE.Quaternion().setFromUnitVectors(UP, closedDir)
        .multiply(scratchQuat.setFromAxisAngle(UP, roll));

      const length = radius * (0.5 + 0.28 * rank) * rand(0.85, 1.12);
      const width = length * rand(0.95, 1.25);
      petalData.push({
        openQuat, closedQuat,
        openPos: ballCenter.clone().addScaledVector(direction, radius * (0.38 + 0.08 * (1 - rank))),
        closedPos: new THREE.Vector3(0, 0.03 - 0.1 * rank, 0).addScaledVector(closedDir, 0.02),
        openScale: new THREE.Vector3(width, length, length),
        closedScale: new THREE.Vector3(width * 0.32, length * 0.42, length * 0.32),
        // outer petals open first, the middle fills in last
        delay: 0.55 * (1 - rank) + rand(0, 0.08),
      });

      // centre a touch deeper and redder, outer skirt more golden
      const depth = 1 - rank;
      instanceColor.setRGB(1, 0.8 + 0.2 * rank - rand(0, 0.14), 0.7 + 0.3 * rank - rand(0, 0.15));
      instanceColor.multiplyScalar((1 - 0.22 * depth * depth) * rand(0.82, 1.0));
      petals.setColorAt(i, instanceColor);
    }
    petals.instanceColor.needsUpdate = true;

    const head = { group, petals, petalData, order: headIndex, lastBloom: -1 };
    heads.push(head);
    return head;
  }

  /* ---- stems + leaves along them --------------------------------------- */

  const stems = [];   // { mesh, indexCount, start, leaves: [], head }
  const scratchQuat = new THREE.Quaternion();

  function leafOrientation(direction, liftDeg) {
    // leaf +x points out along `direction`, tilted up a bit, +y stays roughly up
    const lift = THREE.MathUtils.degToRad(liftDeg);
    const xAxis = direction.clone().setY(0).normalize()
      .multiplyScalar(Math.cos(lift)).addScaledVector(UP, Math.sin(lift)).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, UP).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  }

  function addLeaf(parentList, position, tangent, azimuth, length, revealAt) {
    const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const pivot = new THREE.Group();
    pivot.position.copy(position);
    const mesh = new THREE.Mesh(leafShapes[parentList.length % leafShapes.length], leafMaterial);
    mesh.scale.setScalar(length);
    pivot.add(mesh);
    bush.add(pivot);
    parentList.push({
      pivot, revealAt,
      // folded: hugging the stem. open: arching out from it
      folded: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent.clone().normalize()),
      open: leafOrientation(outward, rand(18, 38)),
    });
  }

  PARAMS.bush.tips.forEach((tipArray, stemIndex) => {
    const tip = new THREE.Vector3(...tipArray);
    const base = new THREE.Vector3(rand(-0.12, 0.12), -1.75, rand(-0.12, 0.12));
    const lean = new THREE.Vector3(tip.x - base.x, 0, tip.z - base.z);
    const height = tip.y - base.y;
    const curve = new THREE.CatmullRomCurve3([
      base,
      base.clone().add(new THREE.Vector3(0, height * 0.3, 0)).addScaledVector(lean, 0.12),
      base.clone().add(new THREE.Vector3(0, height * 0.68, 0)).addScaledVector(lean, 0.62)
        .add(new THREE.Vector3(rand(-0.15, 0.15), 0, rand(-0.15, 0.15))),
      tip,
    ]);
    const geometry = new THREE.TubeGeometry(curve, 60, PARAMS.bush.stemRadius, 6, false);
    // taper toward the tip
    const position = geometry.attributes.position;
    const ringSize = 7;
    for (let i = 0; i < position.count; i++) {
      const ringT = Math.floor(i / ringSize) / 60;
      const center = curve.getPointAt(Math.min(1, ringT));
      const taper = 1 - 0.45 * ringT;
      position.setXYZ(i,
        center.x + (position.getX(i) - center.x) * taper,
        center.y + (position.getY(i) - center.y) * taper,
        center.z + (position.getZ(i) - center.z) * taper);
    }
    const mesh = new THREE.Mesh(geometry, stemMaterial);
    bush.add(mesh);

    const stem = { mesh, indexCount: geometry.index.count,
                   start: stemIndex * PARAMS.bush.growStagger, leaves: [], head: null };

    let azimuth = rand(0, Math.PI * 2);
    for (let leafIndex = 0; leafIndex < PARAMS.leaves.perStem; leafIndex++) {
      const along = 0.12 + 0.72 * (leafIndex / PARAMS.leaves.perStem) + rand(-0.03, 0.03);
      azimuth += THREE.MathUtils.degToRad(137.5) + rand(-0.3, 0.3);
      const size = PARAMS.leaves.length * (1.05 - 0.45 * along) * rand(0.85, 1.1);
      addLeaf(stem.leaves, curve.getPointAt(along), curve.getTangentAt(along),
              azimuth, size, along);
    }

    // head sits on the tip, facing mostly up with a hint of the stem's lean
    const tipDir = curve.getTangentAt(1).lerp(UP, 0.6).normalize();
    stem.head = buildHead(tip, tipDir, stemIndex);
    stems.push(stem);
  });

  const baseLeaves = [];
  for (let i = 0; i < PARAMS.leaves.atBase; i++) {
    const azimuth = (i / PARAMS.leaves.atBase) * Math.PI * 2 + rand(-0.3, 0.3);
    addLeaf(baseLeaves, new THREE.Vector3(rand(-0.1, 0.1), -1.68, rand(-0.1, 0.1)),
            UP, azimuth, PARAMS.leaves.length * rand(1.0, 1.25), i / PARAMS.leaves.atBase);
  }

  /* ---- grow + bloom ---------------------------------------------------- */

  const scratchMatrix = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();

  function applyLeaf(leaf, t) {
    const eased = smooth(THREE.MathUtils.clamp(t, 0, 1));
    leaf.pivot.visible = eased > 0.01;
    leaf.pivot.scale.setScalar(Math.max(eased, 0.0001));
    leaf.pivot.quaternion.slerpQuaternions(leaf.folded, leaf.open, eased);
  }

  function setGrowth(growAmount) {
    for (const stem of stems) {
      const stemT = THREE.MathUtils.clamp((growAmount - stem.start) / 0.62, 0, 1);
      stem.mesh.visible = stemT > 0.002;
      const quads = stem.indexCount / 6;
      stem.mesh.geometry.setDrawRange(0, Math.ceil(stemT * quads) * 6);
      for (const leaf of stem.leaves) applyLeaf(leaf, (stemT - leaf.revealAt) / 0.22);
      const headT = smooth(THREE.MathUtils.clamp((stemT - 0.86) / 0.14, 0, 1));
      stem.head.group.visible = headT > 0.01;
      stem.head.group.scale.setScalar(Math.max(headT, 0.0001));
    }
    for (const leaf of baseLeaves) applyLeaf(leaf, (growAmount - leaf.revealAt * 0.15) / 0.3);
  }

  function setBloom(globalBloom) {
    const stagger = PARAMS.heads.bloomStagger;
    const spread = 1 + stagger * (heads.length - 1);
    for (const head of heads) {
      const bloom = THREE.MathUtils.clamp(globalBloom * spread - stagger * head.order, 0, 1);
      if (Math.abs(bloom - head.lastBloom) < 0.0005) continue;   // nothing moved
      head.lastBloom = bloom;
      const data = head.petalData;
      for (let i = 0; i < data.length; i++) {
        const petal = data[i];
        const t = smooth(THREE.MathUtils.clamp((bloom - petal.delay) / 0.45, 0, 1));
        scratchPos.lerpVectors(petal.closedPos, petal.openPos, t);
        scratchQuat.slerpQuaternions(petal.closedQuat, petal.openQuat, t);
        scratchScale.lerpVectors(petal.closedScale, petal.openScale, t);
        head.petals.setMatrixAt(i, scratchMatrix.compose(scratchPos, scratchQuat, scratchScale));
      }
      head.petals.instanceMatrix.needsUpdate = true;
    }
  }

  return { group: bush, setGrowth, setBloom };
}
