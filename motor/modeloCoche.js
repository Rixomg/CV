/* ============================================================
   MODELO 3D DEL MONOPLAZA (y del Safety Car)
   ------------------------------------------------------------
   Ejes del coche: +Z hacia delante, +X a la izquierda, +Y arriba.
   Medidas reales aproximadas: 5,6 m de largo, 2 m de ancho,
   batalla (distancia entre ejes) de 3,6 m.

   La carrocería NO está hecha con cajas: se "esculpe" uniendo
   secciones transversales (como las costillas de un avión) con
   curvas suaves. Cada sección es { z, x, y, w, h, n }:
     z = posición a lo largo del coche   x, y = centro
     w = ancho   h = alto   n = forma (2 = elipse, 4 = casi rectángulo)
   Para cambiar la silueta basta con tocar esos números.

   Los alerones usan un perfil aerodinámico de verdad (un ala
   extruida) y los neumáticos tienen los hombros redondeados.

   Las piezas que comparten material se FUSIONAN en una sola
   geometría (una vez para todos los coches) → va mucho más fluido.
   Cada coche solo crea sus materiales (los colores de su equipo).
   ============================================================ */

const ModeloCoche = {
  _geos: null, // geometrías compartidas por todos los coches

  // Añade una geometría (transformada por una matriz) a un acumulador
  _añadir(acum, geo, matriz) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matriz) g.applyMatrix4(matriz);
    acum.push(g);
  },

  _fusionar(lista) {
    let total = 0;
    for (const g of lista) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of lista) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    r.computeBoundingSphere();
    r._compartida = true;
    return r;
  },

  // Matriz de posición + rotación (en radianes) + escala
  _m(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
  },

  // Varilla (suspensión) entre dos puntos
  _varilla(acum, a, b, r = 0.016) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const largo = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r, r, largo, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this._añadir(acum, g, m);
  },

  // ---------- SUPERFICIE ESCULPIDA ----------
  // Une las secciones con curvas suaves (Catmull-Rom) y cierra los extremos.
  // alrededor = puntos de cada sección; pasos = sub-secciones entre dos dadas.
  _loft(secciones, alrededor = 28, pasos = 6) {
    // Versión "lejana" (nivel de detalle bajo): menos puntos alrededor y menos pasos entre secciones
    if (this._baja) { alrededor = Math.max(8, Math.round(alrededor * 0.43)); pasos = Math.max(1, Math.round(pasos / 3)); }
    const def = { x: 0, n: 2.6 };
    const S = secciones.map((s) => ({ ...def, ...s }));
    const campos = ['z', 'x', 'y', 'w', 'h', 'n'];
    const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    const M = [];
    for (let i = 0; i < S.length - 1; i++) {
      const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
      for (let k = 0; k < pasos; k++) {
        const r = {};
        for (const c of campos) r[c] = cr(p0[c], p1[c], p2[c], p3[c], k / pasos);
        M.push(r);
      }
    }
    M.push(S[S.length - 1]);

    const zMin = Math.min(...M.map((s) => s.z)), zMax = Math.max(...M.map((s) => s.z));
    const pos = [], uv = [], idx = [];
    const A = alrededor;
    // Punto de la sección: superelipse (n alto = más cuadrada)
    const punto = (s, j) => {
      const th = (j / A) * Math.PI * 2, c = Math.cos(th), si = Math.sin(th), e = 2 / Math.max(1.2, s.n);
      return [s.x + (s.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e), s.y + (s.h / 2) * Math.sign(si) * Math.pow(Math.abs(si), e), c, si];
    };
    for (const s of M) {
      const t = (s.z - zMin) / (zMax - zMin || 1);
      for (let j = 0; j <= A; j++) {
        const [px, py, c, si] = punto(s, j);
        pos.push(px, py, s.z);
        // La textura lateral se lee de delante hacia atrás por los dos lados
        uv.push(c >= 0 ? 1 - t : t, 0.5 + 0.5 * Math.sign(si) * Math.pow(Math.abs(si), 0.7));
      }
    }
    const haciaDelante = M[M.length - 1].z > M[0].z;
    for (let i = 0; i < M.length - 1; i++) {
      for (let j = 0; j < A; j++) {
        const a = i * (A + 1) + j, b = a + A + 1;
        if (haciaDelante) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    // Tapas de los dos extremos (vértices propios para que no se "redondeen")
    const tapa = (s, mirandoAdelante) => {
      const base = pos.length / 3;
      pos.push(s.x, s.y, s.z); uv.push(0.5, 0.5);
      for (let j = 0; j <= A; j++) {
        const [px, py] = punto(s, j);
        pos.push(px, py, s.z); uv.push(0.5, 0.5);
      }
      for (let j = 0; j < A; j++) {
        if (mirandoAdelante) idx.push(base, base + 1 + j, base + 2 + j);
        else idx.push(base, base + 2 + j, base + 1 + j);
      }
    };
    tapa(M[0], !haciaDelante);
    tapa(M[M.length - 1], haciaDelante);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  },

  // ---------- PERFIL DE ALA ----------
  // Ala con forma aerodinámica. El borde de ataque queda en el origen,
  // la cuerda hacia -Z y la envergadura a lo largo de X (centrada).
  // Para darle ángulo: rotación X positiva = borde de salida hacia arriba.
  _ala(cuerda, grosor, envergadura) {
    const c = cuerda, t = grosor;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0, t * 0.7, c * 0.12, t, c * 0.32, t);
    s.quadraticCurveTo(c * 0.8, t * 0.75, c, t * 0.12);
    s.lineTo(c, -t * 0.05);
    s.quadraticCurveTo(c * 0.6, -t * 0.3, c * 0.22, -t * 0.4);
    s.bezierCurveTo(c * 0.05, -t * 0.4, 0, -t * 0.25, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: envergadura, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(Math.PI / 2);         // envergadura → X, cuerda → -Z
    g.translate(-envergadura / 2, 0, 0);
    return g;
  },

  // Placa plana con contorno libre (derivas, aleta de tiburón, fondo...).
  // puntos = [[z, y], ...] vistos de lado; grosor hacia los dos lados de X.
  _placa(puntos, grosor) {
    const s = new THREE.Shape(puntos.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);        // contorno en el plano Z-Y, grosor en X
    g.translate(grosor / 2, 0, 0);
    return g;
  },

  // ---------- Geometrías compartidas ----------
  _construirGeometrias() {
    const B = (w, h, l) => new THREE.BoxGeometry(w, h, l);
    const m = this._m.bind(this);
    const p = { librea: [], secundario: [], acento: [], carbono: [], lateral: [], casco: [], visera: [], tcam: [], luz: [] };
    const ala = { librea: [], secundario: [], acento: [] }; // los dos alerones enteros (para la malla lejana)
    // Piezas que se pueden romper por separado: las dos mitades del alerón delantero (1 = izquierda, x > 0)
    // y el alerón trasero (plano, flap y las dos derivas)
    const alaS = { 1: { librea: [], secundario: [], acento: [] }, '-1': { librea: [], secundario: [], acento: [] } };
    const alaT = { plano: { librea: [] }, flap: { acento: [] }, d1: { secundario: [] }, 'd-1': { secundario: [] } };
    const add = (clave, geo, mat) => this._añadir(p[clave], geo, mat);

    // ===== CHASIS: morro + monocasco + cola, de una pieza =====
    add('librea', this._loft([
      { z: 2.88, y: 0.175, w: 0.15, h: 0.07, n: 2.4 },  // punta del morro
      { z: 2.55, y: 0.23, w: 0.26, h: 0.15, n: 2.6 },
      { z: 2.15, y: 0.30, w: 0.36, h: 0.23, n: 2.8 },
      { z: 1.70, y: 0.37, w: 0.48, h: 0.32, n: 3.0 },
      { z: 1.25, y: 0.42, w: 0.60, h: 0.40, n: 3.2 },
      { z: 0.80, y: 0.43, w: 0.72, h: 0.44, n: 3.4 },   // habitáculo
      { z: 0.35, y: 0.43, w: 0.80, h: 0.46, n: 3.4 },
      { z: -0.10, y: 0.44, w: 0.80, h: 0.52, n: 3.2 },
      { z: -0.55, y: 0.45, w: 0.66, h: 0.58, n: 3.0 },  // motor
      { z: -1.00, y: 0.42, w: 0.48, h: 0.48, n: 2.8 },
      { z: -1.50, y: 0.37, w: 0.34, h: 0.34, n: 2.6 },  // caja de cambios
      { z: -1.95, y: 0.33, w: 0.22, h: 0.22, n: 2.6 },
      { z: -2.36, y: 0.33, w: 0.13, h: 0.13, n: 2.4 },  // estructura de impacto trasera
    ], 30, 6));

    // Toma de aire sobre la cabeza del piloto + tapa motor (joroba)
    add('librea', this._loft([
      { z: 0.10, y: 0.95, w: 0.22, h: 0.20, n: 2.6 },
      { z: -0.15, y: 0.92, w: 0.30, h: 0.34, n: 2.8 },
      { z: -0.50, y: 0.84, w: 0.32, h: 0.30, n: 2.8 },
      { z: -1.00, y: 0.70, w: 0.22, h: 0.16, n: 2.6 },
      { z: -1.60, y: 0.55, w: 0.08, h: 0.06, n: 2.4 },
    ], 22, 5));
    add('carbono', new THREE.CircleGeometry(1, 18), m(0, 0.955, 0.102, 0, 0, 0, 0.085, 0.07, 1)); // boca de la toma
    // (24-11 CV) sin la T-cam de encima del casco: en la onboard se veía como una barra negra arriba toda la vuelta
    // Aleta de tiburón
    add('secundario', this._placa([[-0.15, 1.07], [-1.1, 0.92], [-1.78, 0.64], [-1.78, 0.56], [-0.6, 0.8], [-0.15, 0.98]], 0.014), m(0, 0, 0));

    // Habitáculo: hueco oscuro, casco y visera
    add('carbono', new THREE.SphereGeometry(1, 20, 10), m(0, 0.655, 0.36, 0, 0, 0, 0.25, 0.05, 0.42));
    // (12-11) CASCO como los de verdad (Cascos_reales/): carcasa alargada hacia atrás y algo más alta que ancha, visera
    // ancha de espejo, mentonera y el alerón pequeño de arriba. La decoración es una textura por piloto (js/coche/cascos.js)
    const esc = [0.128, 0.145, 0.158];
    add('casco', new THREE.SphereGeometry(1, 32, 20), m(0, 0.77, 0.205, 0, 0, 0, ...esc));
    add('visera', new THREE.SphereGeometry(1.035, 28, 6, Math.PI / 2 - 0.92, 1.84, 1.1, 0.44), m(0, 0.77, 0.205, 0, 0, 0, ...esc));
    // (24-11 CV) sin el alerón de arriba del casco: desde la onboard se veía como una placa rara encima de la cabeza
    for (const s of [1, -1]) add('carbono', new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10), m(s * 0.128, 0.775, 0.255, 0, 0, Math.PI / 2)); // botones de la visera
    // (la visera vieja, de carbono, ya no: ahora es de espejo, 'visera')

    // Halo: arco de titanio alrededor de la cabeza + pilar central
    const arco = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.30, 0.66, -0.12), new THREE.Vector3(0.30, 0.86, -0.02), new THREE.Vector3(0.25, 0.92, 0.25),
      new THREE.Vector3(0.12, 0.935, 0.48), new THREE.Vector3(0, 0.94, 0.53),
      new THREE.Vector3(-0.12, 0.935, 0.48), new THREE.Vector3(-0.25, 0.92, 0.25), new THREE.Vector3(-0.30, 0.86, -0.02), new THREE.Vector3(-0.30, 0.66, -0.12),
    ]);
    add('carbono', new THREE.TubeGeometry(arco, 40, 0.026, 8, false));
    const pilar = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.65, 0.86), new THREE.Vector3(0, 0.82, 0.68), new THREE.Vector3(0, 0.94, 0.53)]);
    add('carbono', new THREE.TubeGeometry(pilar, 10, 0.03, 8, false));

    // ===== PONTONES (llevan la decoración del equipo) =====
    for (const s of [1, -1]) {
      add('lateral', this._loft([
        { z: 0.95, x: s * 0.52, y: 0.44, w: 0.30, h: 0.24, n: 2.6 },  // boca
        { z: 0.75, x: s * 0.57, y: 0.43, w: 0.44, h: 0.34, n: 3.0 },
        { z: 0.30, x: s * 0.60, y: 0.40, w: 0.48, h: 0.38, n: 3.2 },
        { z: -0.30, x: s * 0.56, y: 0.36, w: 0.44, h: 0.32, n: 3.0 },
        { z: -0.90, x: s * 0.45, y: 0.30, w: 0.30, h: 0.22, n: 2.6 },
        { z: -1.45, x: s * 0.30, y: 0.25, w: 0.12, h: 0.12, n: 2.4 },  // se estrecha hacia la "botella de Coca-Cola"
      ], 24, 5));
      add('carbono', new THREE.CircleGeometry(1, 18), m(s * 0.52, 0.44, 0.957, 0, 0, 0, 0.13, 0.1, 1)); // entrada de aire

      // Retrovisores: carcasa aerodinámica sobre un brazo
      add('librea', this._loft([
        { z: 0.98, x: s * 0.47, y: 0.73, w: 0.06, h: 0.03 },
        { z: 0.94, x: s * 0.47, y: 0.73, w: 0.17, h: 0.075 },
        { z: 0.86, x: s * 0.47, y: 0.73, w: 0.15, h: 0.06 },
        { z: 0.80, x: s * 0.47, y: 0.73, w: 0.05, h: 0.02 },
      ], 14, 3));
      this._varilla(p.carbono, [s * 0.32, 0.6, 0.92], [s * 0.45, 0.71, 0.88], 0.012);

      // Deflectores verticales delante de los pontones
      add('carbono', this._placa([[1.35, 0.08], [0.95, 0.08], [0.95, 0.32], [1.2, 0.28]], 0.012), m(s * 0.66, 0, 0));
    }

    // ===== FONDO PLANO Y DIFUSOR =====
    const contorno = [[0.3, 1.45], [0.55, 1.15], [0.79, 0.6], [0.8, -0.6], [0.72, -1.1], [0.55, -1.35], [0.5, -2.15]];
    const planta = new THREE.Shape([...contorno.map(([x, z]) => new THREE.Vector2(x, -z)), ...contorno.slice().reverse().map(([x, z]) => new THREE.Vector2(-x, -z))]);
    const suelo = new THREE.ExtrudeGeometry(planta, { depth: 0.03, bevelEnabled: false });
    suelo.rotateX(-Math.PI / 2);
    add('carbono', suelo, m(0, 0.05, 0));
    for (const s of [1, -1]) add('carbono', this._placa([[0.6, 0.08], [-1.1, 0.08], [-1.1, 0.13], [0.6, 0.1]], 0.01), m(s * 0.79, 0, 0)); // borde del suelo
    add('carbono', B(1.0, 0.018, 0.5), m(0, 0.2, -2.32, -0.32)); // rampa del difusor
    for (const x of [-0.45, -0.15, 0.15, 0.45]) add('carbono', this._placa([[-2.08, 0.08], [-2.56, 0.3], [-2.56, 0.12], [-2.15, 0.06]], 0.012), m(x, 0, 0));

    // ===== ALERÓN DELANTERO (grupo aparte: si hay un toque, se rompe) =====
    const addAla = (s, clave, geo, mat) => { this._añadir(ala[clave], geo, mat); this._añadir(alaS[s][clave], geo, mat); };
    for (const s of [1, -1]) {
      addAla(s, 'secundario', this._ala(0.34, 0.022, 0.95), m(s * 0.475, 0.09, 2.98, 0.05)); // plano principal (cada mitad)
      addAla(s, 'librea', this._ala(0.19, 0.016, 0.74), m(s * 0.59, 0.135, 2.8, 0.32));       // flaps
      addAla(s, 'librea', this._ala(0.17, 0.014, 0.66), m(s * 0.63, 0.19, 2.68, 0.55));
      addAla(s, 'acento', this._ala(0.15, 0.012, 0.56), m(s * 0.68, 0.255, 2.58, 0.78));
      addAla(s, 'secundario', this._placa([[3.02, 0.06], [2.42, 0.06], [2.42, 0.34], [2.62, 0.38], [2.95, 0.2], [3.02, 0.12]], 0.02), m(s * 0.955, 0, 0)); // deriva
      add('secundario', B(0.02, 0.1, 0.24), m(s * 0.08, 0.14, 2.82)); // soportes al morro (se quedan aunque se rompa el alerón)
    }

    // ===== ALERÓN TRASERO (fijo: el juego es histórico, sin DRS) =====
    const addT = (n, clave, geo, mat) => { this._añadir(ala[clave], geo, mat); this._añadir(alaT[n][clave], geo, mat); };
    for (const s of [1, -1]) addT('d' + s, 'secundario', this._placa([[-2.2, 0.42], [-2.8, 0.42], [-2.8, 1.08], [-2.36, 1.08], [-2.2, 0.86]], 0.024), m(s * 0.5, 0, 0)); // derivas
    addT('plano', 'librea', this._ala(0.38, 0.03, 0.98), m(0, 0.82, -2.3, 0.25));     // plano principal
    addT('flap', 'acento', this._ala(0.22, 0.016, 0.98), m(0, 0.95, -2.6, 0.8));      // flap superior
    add('carbono', this._ala(0.2, 0.018, 0.9), m(0, 0.42, -2.42, 0.2));     // "beam wing"
    add('carbono', this._placa([[-2.25, 0.36], [-2.4, 0.36], [-2.47, 0.86], [-2.37, 0.86]], 0.03), m(0, 0, 0)); // pilón cuello de cisne
    add('luz', B(0.12, 0.07, 0.03), m(0, 0.33, -2.37));

    // ===== SUSPENSIONES (triángulos de fibra y bieletas) =====
    for (const s of [1, -1]) {
      // Delante: triángulo superior, inferior, empujador y dirección
      this._varilla(p.carbono, [s * 0.26, 0.5, 1.6], [s * 0.64, 0.47, 1.8]);
      this._varilla(p.carbono, [s * 0.24, 0.5, 2.02], [s * 0.64, 0.47, 1.8]);
      this._varilla(p.carbono, [s * 0.2, 0.24, 1.55], [s * 0.64, 0.22, 1.8]);
      this._varilla(p.carbono, [s * 0.18, 0.26, 2.05], [s * 0.64, 0.22, 1.8]);
      this._varilla(p.carbono, [s * 0.62, 0.24, 1.8], [s * 0.26, 0.47, 1.72], 0.013);
      this._varilla(p.carbono, [s * 0.22, 0.36, 1.92], [s * 0.64, 0.35, 1.9], 0.011);
      // Detrás
      this._varilla(p.carbono, [s * 0.2, 0.46, -1.55], [s * 0.58, 0.47, -1.8]);
      this._varilla(p.carbono, [s * 0.16, 0.44, -2.0], [s * 0.58, 0.47, -1.8]);
      this._varilla(p.carbono, [s * 0.2, 0.2, -1.5], [s * 0.58, 0.22, -1.8]);
      this._varilla(p.carbono, [s * 0.14, 0.2, -2.05], [s * 0.58, 0.22, -1.8]);
      this._varilla(p.carbono, [s * 0.56, 0.45, -1.8], [s * 0.18, 0.24, -1.7], 0.013);
    }

    const g = {};
    for (const k in p) g[k] = this._fusionar(p[k]);
    g.ala = {};
    for (const k in ala) g.ala[k] = this._fusionar(ala[k]);
    g.alaS = {}; g.alaT = {};
    for (const s in alaS) { g.alaS[s] = {}; for (const k in alaS[s]) g.alaS[s][k] = this._fusionar(alaS[s][k]); }
    for (const n in alaT) { g.alaT[n] = {}; for (const k in alaT[n]) g.alaT[n][k] = this._fusionar(alaT[n][k]); }

    // Rueda: neumático con hombros redondeados (torneado), tapacubos y flanco de color
    const neumatico = (ancho) => {
      const R = 0.36, r = 0.235, a = ancho / 2;
      const perfil = [
        [r, -a], [0.32, -a], [0.345, -a + 0.012], [0.357, -a + 0.035], [R, -a + 0.07],
        [R, a - 0.07], [0.357, a - 0.035], [0.345, a - 0.012], [0.32, a], [r, a],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const geo = new THREE.LatheGeometry(perfil, this._baja ? 10 : 36).rotateZ(Math.PI / 2);
      geo._compartida = true;
      return geo;
    };
    g.neuDel = neumatico(0.31);
    g.neuTras = neumatico(0.39);
    g.tapa = new THREE.CircleGeometry(0.236, 24);
    g.flanco = new THREE.RingGeometry(0.245, 0.352, 36);
    g.numero = new THREE.PlaneGeometry(0.24, 0.24).rotateX(-Math.PI / 2 + 0.25);
    g.sombra = new THREE.PlaneGeometry(2.3, 5.8).rotateX(-Math.PI / 2);
    for (const k of ['tapa', 'flanco', 'numero', 'sombra']) g[k]._compartida = true;
    return g;
  },

  // ---------- Crea un coche completo ----------
  crear(equipo, piloto, indicePiloto) {
    if (!this._geos) this._geos = this._construirGeometrias();
    const G = this._geos;
    const c = equipo.colores;
    const pintura = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
    const mats = {
      librea: pintura(c.principal),
      secundario: pintura(c.secundario),
      acento: pintura(c.acento),
      carbono: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.42, metalness: 0.45 }),
      lateral: new THREE.MeshPhysicalMaterial({ map: Texturas.lateralCoche(equipo), roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 }),
      casco: new THREE.MeshPhysicalMaterial({ map: Cascos.textura(piloto, equipo), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
      visera: new THREE.MeshPhysicalMaterial({ color: Cascos.visera(piloto), metalness: 0.85, roughness: 0.06, clearcoat: 1, iridescence: 0.7 }),
      tcam: new THREE.MeshStandardMaterial({ color: indicePiloto === 0 ? '#111111' : '#ffd400', roughness: 0.5 }),
      luz: new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1010', emissiveIntensity: 0 }),
    };

    const grupo = new THREE.Group();   // posición en la pista
    const cuerpo = new THREE.Group();  // se inclina al frenar/girar y se eleva con los gatos
    grupo.add(cuerpo);
    for (const k of ['librea', 'secundario', 'acento', 'carbono', 'lateral', 'casco', 'visera', 'tcam', 'luz']) {
      const malla = new THREE.Mesh(G[k], mats[k]);
      malla.castShadow = true;
      cuerpo.add(malla);
    }

    // Piezas que se rompen por separado (ver CocheVisual._aplicarDaños):
    // las dos mitades del alerón delantero, las piezas del trasero y los pontones rotos
    const grupoDe = (geos) => {
      const gr = new THREE.Group();
      for (const k in geos) { const malla = new THREE.Mesh(geos[k], mats[k]); malla.castShadow = true; gr.add(malla); }
      cuerpo.add(gr);
      return gr;
    };
    const aleron = { 1: grupoDe(G.alaS[1]), '-1': grupoDe(G.alaS[-1]) };
    const trasero = {};
    for (const n in G.alaT) trasero[n] = grupoDe(G.alaT[n]);
    const ponton = {};
    for (const s of [1, -1]) {
      // Pontón roto: fibra de carbono a la vista y trozos sueltos que sobresalen
      const gr = new THREE.Group();
      for (const [x, y, z, w, h, l, rx, rz] of [[0.84, 0.42, 0.35, 0.06, 0.24, 0.55, 0.2, 0.3], [0.9, 0.35, -0.12, 0.04, 0.16, 0.38, -0.4, -0.5], [0.96, 0.3, 0.6, 0.03, 0.12, 0.3, 0.6, 0.9], [0.8, 0.52, -0.4, 0.05, 0.08, 0.3, 0.9, 0.2]]) {
        const pz = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mats.carbono);
        pz.position.set(s * x, y, z); pz.rotation.set(rx, 0, s * rz);
        gr.add(pz);
      }
      gr.visible = false;
      cuerpo.add(gr);
      ponton[s] = gr;
    }
    const detalles = []; // piezas pequeñas que no se dibujan cuando el coche está lejos

    // Número en el morro
    const num = new THREE.Mesh(G.numero, new THREE.MeshStandardMaterial({ map: Texturas.numero(piloto.numero, c.principal, c.secundario === c.principal ? '#fff' : c.secundario), roughness: 0.4 }));
    num.position.set(0, 0.478, 1.95);
    cuerpo.add(num);
    detalles.push(num);

    // Ruedas
    const matNeumatico = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.88 });
    const matTapa = new THREE.MeshStandardMaterial({ color: '#202327', roughness: 0.35, metalness: 0.7 });
    const matCompuesto = new THREE.MeshStandardMaterial({ map: Texturas.flancoNeumatico(), color: '#ffd12a', roughness: 0.6, transparent: true, alphaTest: 0.4 });
    const ruedas = [];
    const datos = [
      { x: 0.8, z: 1.8, ancho: 0.31, delantera: true },
      { x: -0.8, z: 1.8, ancho: 0.31, delantera: true },
      { x: 0.78, z: -1.8, ancho: 0.39, delantera: false },
      { x: -0.78, z: -1.8, ancho: 0.39, delantera: false },
    ];
    for (const d of datos) {
      const pivote = new THREE.Group(); // gira para la dirección (delanteras)
      pivote.position.set(d.x, 0.36, d.z);
      const giro = new THREE.Group();   // gira sobre su eje al rodar
      pivote.add(giro);
      const neu = new THREE.Mesh(d.delantera ? G.neuDel : G.neuTras, matNeumatico);
      neu.castShadow = true;
      giro.add(neu);
      const lado = Math.sign(d.x);
      // Tapacubos por los dos lados y el flanco de color (con letras: así se ve girar)
      for (const cara of [1, -1]) {
        const tapa = new THREE.Mesh(G.tapa, matTapa);
        tapa.rotation.y = cara * Math.PI / 2;
        tapa.position.x = cara * (d.ancho / 2 - 0.004);
        giro.add(tapa);
        detalles.push(tapa);
      }
      const flanco = new THREE.Mesh(G.flanco, matCompuesto);
      flanco.rotation.y = lado * Math.PI / 2;
      flanco.position.x = lado * (d.ancho / 2 + 0.003);
      giro.add(flanco);
      detalles.push(flanco);
      cuerpo.add(pivote);
      ruedas.push({ pivote, giro, base: pivote.position.clone(), delantera: d.delantera, lado });
    }

    // Sombra de contacto (para coches lejos de la zona de sombras reales)
    const sombra = new THREE.Mesh(G.sombra, new THREE.MeshBasicMaterial({ map: Texturas.mancha(), color: '#000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    sombra.position.y = 0.04;
    grupo.add(sombra);

    // Spray de agua cuando llueve
    const spray = new THREE.Sprite(new THREE.SpriteMaterial({ map: Texturas.mancha(), color: '#dfe6ee', transparent: true, opacity: 0, depthWrite: false }));
    spray.scale.set(3.6, 2.2, 1);
    spray.position.set(0, 0.9, -3.6);
    grupo.add(spray);

    const lejos = new THREE.Mesh(this._geometriaLejana(mats, datos), this._matLejano || (this._matLejano = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })));
    lejos.castShadow = true;
    lejos.visible = false;
    cuerpo.add(lejos);

    return new CocheVisual(grupo, cuerpo, ruedas, mats, matCompuesto, spray, aleron, detalles, lejos, { trasero, ponton });
  },

  // NIVEL DE DETALLE LEJANO: la misma silueta con menos secciones, y carrocería,
  // alerones y ruedas fusionados en UNA geometría con los colores del equipo en
  // los vértices → una sola llamada de dibujo por coche (en vez de ~20).
  _geometriaLejana(mats, ruedas) {
    if (!this._geosBaja) { this._baja = true; this._geosBaja = this._construirGeometrias(); this._baja = false; }
    const G = this._geosBaja, partes = [];
    for (const k of ['librea', 'secundario', 'acento', 'carbono', 'lateral', 'casco', 'visera', 'tcam']) partes.push([G[k], k === 'lateral' ? mats.librea.color : k === 'casco' && mats.casco.map ? new THREE.Color(mats.casco.map.userData.base) : mats[k].color, null]);
    for (const k in G.ala) partes.push([G.ala[k], mats[k].color, null]);
    const negro = new THREE.Color('#151515');
    for (const d of ruedas) partes.push([d.delantera ? G.neuDel : G.neuTras, negro, new THREE.Matrix4().makeTranslation(d.x, 0.36, d.z)]);
    const pos = [], nor = [], col = [];
    for (const [geo, color, matriz] of partes) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (matriz) g.applyMatrix4(matriz);
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) col.push(color.r, color.g, color.b);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    r.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    r.computeBoundingSphere();
    return r;
  },

  // ---------- Safety Car ----------
  crearSafetyCar() {
    const grupo = new THREE.Group();
    const pintura = new THREE.MeshPhysicalMaterial({ color: '#c9ced4', roughness: 0.3, metalness: 0.7, clearcoat: 1 });
    const negro = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5 });
    const cristal = new THREE.MeshStandardMaterial({ color: '#1c2a38', roughness: 0.1, metalness: 0.6 });
    const caja = (w, h, l, x, y, z, mat, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      grupo.add(m);
      return m;
    };
    caja(1.95, 0.55, 4.5, 0, 0.55, 0, pintura);
    caja(1.6, 0.45, 2.0, 0, 1.02, -0.35, cristal);
    caja(1.5, 0.08, 1.9, 0, 1.27, -0.35, pintura);
    caja(1.9, 0.12, 0.3, 0, 0.98, -2.2, negro); // alerón
    for (const [x, z] of [[0.85, 1.45], [-0.85, 1.45], [0.85, -1.4], [-0.85, -1.4]]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 18).rotateZ(Math.PI / 2), negro);
      r.position.set(x, 0.34, z);
      grupo.add(r);
    }
    // Barra de luces (naranja / verde alternando)
    const luzA = new THREE.MeshStandardMaterial({ color: '#ff9a00', emissive: '#ff8000', emissiveIntensity: 2 });
    const luzB = new THREE.MeshStandardMaterial({ color: '#00ff66', emissive: '#00ff55', emissiveIntensity: 0 });
    caja(1.1, 0.1, 0.25, 0, 1.36, -0.2, negro);
    caja(0.4, 0.12, 0.2, 0.3, 1.43, -0.2, luzA);
    caja(0.4, 0.12, 0.2, -0.3, 1.43, -0.2, luzB);
    const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: Texturas._crear('rotuloSC', 256, 64, (g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffcc00'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SAFETY CAR', w / 2, h / 2 + 2);
    }, { repetir: false }) }));
    rotulo.rotation.y = Math.PI;
    rotulo.position.set(0, 0.62, -2.26);
    grupo.add(rotulo);
    grupo.userData = { luzA, luzB };
    grupo.visible = false;
    return grupo;
  },
};

/* ------------------------------------------------------------
   COCHE VISUAL — mueve y anima un coche según la simulación
   ------------------------------------------------------------ */
class CocheVisual {
  constructor(grupo, cuerpo, ruedas, mats, matCompuesto, spray, aleron, detalles, lejos, piezas) {
    this.trasero = piezas.trasero;   // alerón trasero: plano, flap y derivas (d1, d-1)
    this.ponton = piezas.ponton;     // pontón roto de cada lado (1 / -1)
    this._incl = { roll: 0, pitch: 0 }; // inclinación por un pinchazo
    this._dañoCodigo = 0;
    this.lejos = lejos;          // malla de una pieza para cuando el coche se ve pequeño
    this.nivel = 0;              // 0 = todo, 1 = sin piezas pequeñas, 2 = malla lejana
    this.partesCerca = cuerpo.children.filter((o) => o !== lejos); // carrocería, alerón, ruedas, número
    this.grupo = grupo;
    this.cuerpo = cuerpo;
    this.ruedas = ruedas;
    this.mats = mats;
    this.matCompuesto = matCompuesto;
    this.spray = spray;
    this.aleron = aleron;
    this.detalles = detalles;
    this.conDetalle = true;
    this.angRuedas = 0;
    this.cabeceo = 0;
    this.balanceo = 0;
    this.compuesto = null;
    this._tiempo = Math.random() * 10;
  }

  // Muestra u oculta las piezas pequeñas (solo cambia algo si cambia el estado)
  detalle(si) {
    if (si === this.conDetalle) return;
    this.conDetalle = si;
    for (const d of this.detalles) d.visible = si;
  }

  // Nivel de detalle según lo grande que se ve el coche en pantalla.
  // d = distancia "efectiva" en metros (la real corregida por el zoom de la cámara)
  distancia(d) {
    const G = CONFIG.graficos;
    const n = d > G.distanciaLejosCoche ? 2 : d > G.distanciaDetalleCoche ? 1 : 0;
    if (n === this.nivel) return;
    if ((n === 2) !== (this.nivel === 2)) {
      for (const p of this.partesCerca) p.visible = n !== 2;
      this.lejos.visible = n === 2;
      this._dañoCodigo = null; // (al cambiar de malla se vuelven a poner los daños)
    }
    this.nivel = n;
    this.detalle(n === 0);
  }

  // Coloca los daños visibles (D = Utils.leerDaños). Lado: 1 = izquierda (x > 0), −1 = derecha.
  // Cada pieza tiene varias formas de romperse (ver Carrera._romper): así no se ven todas iguales
  _aplicarDaños(D) {
    const ver = (o, v) => { o.visible = v && this.nivel !== 2; };
    // Gira un grupo alrededor del eje z del coche pasando por la altura yc (como si colgara de ahí)
    const colgar = (g, ang, yc, dy = 0) => { g.rotation.set(0, 0, ang); g.position.set(yc * Math.sin(ang), yc * (1 - Math.cos(ang)) + dy, 0); };
    // --- Alerón delantero (15-11: el número es la GRAVEDAD, de menos a más; ver Carrera._romper):
    //     1 tocado (media ala algo doblada), 2 media ala colgando hasta el suelo, 3 media ala arrancada, 4 sin alerón
    for (const s of [1, -1]) { colgar(this.aleron[s], 0, 0); ver(this.aleron[s], true); }
    if (D.fa) {
      const s = D.fl, g = this.aleron[s], o = this.aleron[-s];
      if (D.fa === 1) colgar(g, -s * 0.05, 0.09, -0.01);
      else if (D.fa === 2) { colgar(g, -s * 0.13, 0.09, -0.02); colgar(o, -s * 0.02, 0.09, -0.01); }
      else if (D.fa === 3) ver(g, false);
      else { ver(g, false); ver(o, false); }
    }
    // --- Alerón trasero (15-11, por gravedad): 1 flap algo caído, 2 sin flap y plano torcido, 3 caído hacia un lado, 4 arrancado
    const T = this.trasero;
    for (const n in T) { colgar(T[n], 0, 0); ver(T[n], true); }
    if (D.ta) {
      const s = D.tl;
      // (05-11) Ángulos más grandes: con 0,1-0,16 rad no se notaba desde las cámaras de la tele ni en las repeticiones
      if (D.ta === 1) colgar(T.flap, -s * 0.12, 0.86, -0.03);
      else if (D.ta === 2) { ver(T.flap, false); colgar(T.plano, -s * 0.22, 0.86, -0.05); }
      else if (D.ta === 3) { colgar(T.plano, -s * 0.45, 0.86, -0.14); colgar(T.flap, -s * 0.5, 0.86, -0.16); ver(T['d' + s], false); }
      else for (const n in T) ver(T[n], false);
    }
    // --- Pontón roto
    for (const s of [1, -1]) ver(this.ponton[s], D.ponton === s);
    // --- Ruedas: la pinchada se aplasta y el coche se inclina hacia ella; la de la suspensión rota, torcida
    const rueda = (n) => (n ? this.ruedas.find((r) => r.delantera === (n <= 2) && r.lado === (n % 2 ? 1 : -1)) : null);
    for (const r of this.ruedas) { r.giro.scale.set(1, 1, 1); r.pivote.position.y = r.base.y; r.pivote.rotation.z = 0; }
    this._incl.roll = 0; this._incl.pitch = 0;
    const rp = rueda(D.rueda);
    if (rp) {
      rp.giro.scale.set(1, 0.86, 0.86); rp.pivote.position.y = r0(rp) - 0.05;
      this._incl.roll = -rp.lado * 0.035; this._incl.pitch = rp.delantera ? 0.014 : -0.014;
    }
    const rs = rueda(D.susp);
    if (rs) { rs.pivote.rotation.z = rs.lado * 0.25; rs.pivote.position.y = r0(rs) - 0.03; }
    function r0(r) { return r.base.y; }
  }

  // pose: { x, z, rumbo, v, aceleracion, curvatura, compuesto, alzado, ruedasFuera, humedad, visible, daños }
  actualizar(pose, dt) {
    const g = this.grupo;
    g.visible = pose.visible !== false;
    if (!g.visible) return;
    g.position.set(pose.x, pose.y || 0, pose.z);
    // Cuesta (Mónaco): el coche se inclina con la pendiente (morro arriba al subir)
    g.rotation.order = 'YXZ';
    g.rotation.y = pose.rumbo;
    g.rotation.x = -Math.atan(pose.pendiente || 0);

    // Ruedas girando según la velocidad (radio 0,36 m)
    this.angRuedas += (pose.v / 0.36) * dt;
    const volante = Utils.limitar(pose.curvatura * 3.2, -0.45, 0.45);
    if (this.nivel < 2) for (const r of this.ruedas) {
      r.giro.rotation.x = this.angRuedas;
      if (r.delantera) r.pivote.rotation.y = -volante;
      // En boxes las ruedas salen hacia fuera mientras se cambian
      r.pivote.position.x = r.base.x + r.lado * (pose.ruedasFuera || 0) * 0.55;
      r.pivote.visible = (pose.ruedasFuera || 0) < 0.98;
    }

    // Inclinación por frenada / aceleración y por curva (muy sutil, como en la tele)
    const objCabeceo = Utils.limitar((pose.aceleracion || 0) * 0.0012, -0.025, 0.02);
    const objBalanceo = Utils.limitar(pose.curvatura * pose.v * pose.v * 0.0004, -0.03, 0.03);
    // (23-11) suavizado exponencial: igual a cualquier ritmo de fotogramas (antes Math.min(1, dt × 6))
    this.cabeceo += (objCabeceo - this.cabeceo) * (1 - Math.exp(-dt * 6));
    this.balanceo += (objBalanceo - this.balanceo) * (1 - Math.exp(-dt * 6));
    // DAÑOS (Utils.codigoDaños): se colocan solo cuando cambian
    const cod = pose.daños || 0;
    if (cod !== this._dañoCodigo) { this._dañoCodigo = cod; this._aplicarDaños(Utils.leerDaños(cod)); }
    this.cuerpo.rotation.x = this.cabeceo + this._incl.pitch;
    this.cuerpo.rotation.z = this.balanceo + this._incl.roll;
    this.cuerpo.position.y = (pose.alzado || 0) * 0.07;


    // Color del compuesto
    if (pose.compuesto !== this.compuesto) {
      this.compuesto = pose.compuesto;
      this.matCompuesto.color.set(CONFIG.neumaticos[pose.compuesto].color);
    }

    // Lluvia: luz trasera parpadeando y spray
    this._tiempo += dt;
    const h = pose.humedad || 0;
    this.mats.luz.emissiveIntensity = h > 0.15 ? (Math.floor(this._tiempo * 4) % 2 ? 4 : 0.3) : 0;
    this.spray.material.opacity = Utils.limitar(h * (pose.v / 60) * 0.7, 0, 0.75);
    this.spray.visible = this.spray.material.opacity > 0.01;
  }
}
