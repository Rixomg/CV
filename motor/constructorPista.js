/* ============================================================
   CONSTRUCTOR DE PISTA — convierte el Trazado en objetos 3D.
   ------------------------------------------------------------
   Casi todo se fabrica con "cintas": tiras de triángulos que
   siguen la pista a una distancia lateral dada (asfalto, pianos,
   grava, muros, tribunas...). Las piezas que usan el mismo
   material se juntan en una sola malla para que vaya fluido.
   ============================================================ */

// Acumula vértices de muchas piezas para crear UNA malla al final
class Lote {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }

  get vacio() {
    return this.idx.length === 0;
  }

  vertice(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  triangulo(a, b, c) {
    this.idx.push(a, b, c);
  }

  malla(material, sombras = { recibe: true, proyecta: false }) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = sombras.recibe;
    m.castShadow = sombras.proyecta;
    return m;
  }
}

class ConstructorPista {
  constructor(trazado) {
    this.t = trazado;
    this.grupo = new THREE.Group();
    this.grupo.name = 'pista';
    this.rnd = Utils.semilla(trazado.datos.id.length * 977 + 13);
    this.lotes = {};      // clave → { lote, material }
    this.lucesSalida = []; // materiales del semáforo (5 columnas)

    this.vis = trazado.datos.visual || {}; // opciones visuales del circuito (circuitos.js)
    this.ocupado = [];    // [x, z, radio] de tribunas y edificios (el entorno no pone árboles ahí)
    this._materiales();
    this._zonasEspeciales();
    this._asfaltoYLineas();
    this._pianos();
    this._escapatorias();
    this._muros();
    this._boxes();
    this._salida();
    this._tribunas();
    this._puentes();
    this._detalles();
    if (this.vis.ambiente) { this._neumaticos(); this._franjasYLogos(); this._paddock(); } // (circuitos.js → visual.ambiente)
    this._carpas(); // (circuitos.js → carpas: zonas de hospitality con carpas blancas, Interlagos)
    this._tunel();
    this._muelle();
    this._murosAltos(); this._lineasBorde(); this._fachadas(); this._edificios(); this._jardines(); this._barrerasColor(); this._gruas(); // (Mónaco: ver circuitos.js)
    this._crearMallas();
  }

  // ---------- Materiales ----------
  _materiales() {
    const asfalto = this.vis.asfalto?.granulado ? Texturas.asfaltoGranulado() : Texturas.asfalto();
    this.colorAsfalto = this.vis.asfalto?.color || '#9a9ea3';
    this.mat = {
      asfalto: new THREE.MeshStandardMaterial({ map: asfalto, color: this.colorAsfalto, roughness: 0.92, metalness: 0 }),
      escapatoria: new THREE.MeshStandardMaterial({ map: asfalto, color: '#8a9298', roughness: 0.95 }),
      pitlane: new THREE.MeshStandardMaterial({ map: asfalto, color: '#8a8e94', roughness: 0.9 }),
      goma: new THREE.MeshBasicMaterial({ color: '#000000', map: this._texGoma(), transparent: true, opacity: (this.vis.goma ?? 0.22) * 0.75, depthWrite: false }), // (12-11: difuminada, ver _texGoma)
      blanco: new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.6 }),
      piano: new THREE.MeshStandardMaterial({ map: Texturas.piano(...(this.vis.piano || [])), roughness: 0.7 }),
      grava: new THREE.MeshStandardMaterial({ map: Texturas.grava(), roughness: 1 }),
      hormigon: new THREE.MeshStandardMaterial({ color: '#b9bcc0', roughness: 0.9, side: THREE.DoubleSide }),
      gris: new THREE.MeshStandardMaterial({ color: '#6b7078', roughness: 0.8, side: THREE.DoubleSide }),
      oscuro: new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.7, side: THREE.DoubleSide }),
      red: new THREE.MeshStandardMaterial({ map: Texturas.red(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }),
      publico: new THREE.MeshStandardMaterial({ map: Texturas.publico(), roughness: 1 }),
      cristal: new THREE.MeshStandardMaterial({ color: '#7fb6d9', roughness: 0.15, metalness: 0.6, emissive: '#10283a' }),
      cuadros: new THREE.MeshStandardMaterial({ map: Texturas.cuadros(), roughness: 0.6 }),
      naranja: new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 }),
    };
    // Capas del suelo: "polygonOffset" decide quién se dibuja encima cuando están casi a la misma altura
    // (evita el parpadeo llamado z-fighting). Número mayor = más al fondo.
    const capa = (m, n) => { m.polygonOffset = true; m.polygonOffsetFactor = n; m.polygonOffsetUnits = n; };
    // (15-11) la grava, un pelo POR ENCIMA del asfalto de escapatoria: estaban en la misma capa y, donde se tocan,
    // salían triángulos negros de asfalto atravesando la arena (captura del móvil del autor)
    capa(this.mat.escapatoria, 1); capa(this.mat.grava, 0.5); capa(this.mat.pitlane, 0); capa(this.mat.asfalto, -1);
    capa(this.mat.goma, -2); capa(this.mat.blanco, -3); capa(this.mat.piano, -3); capa(this.mat.cuadros, -4);
    this._capa = capa;
    const marcas = this.vis.publicidad; // lista propia del circuito (o las marcas de siempre)
    this.matPublicidad = marcas
      ? marcas.map((m) => this._sinEspejo(new THREE.MeshStandardMaterial({ map: Texturas.publicidadMarca(m), roughness: 0.6, side: THREE.DoubleSide })))
      : Texturas.MARCAS.map((m, i) => this._sinEspejo(new THREE.MeshStandardMaterial({ map: Texturas.publicidad(i), roughness: 0.6, side: THREE.DoubleSide })));
  }

  // Carteles: por delante, la publicidad; por DETRÁS, gris liso (como un cartel de verdad).
  // Antes, las cámaras de TV (que están detrás de los muros) veían el cartel por detrás, en espejo: "ASNOM".
  _sinEspejo(mat) {
    mat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.30, 0.31, 0.33);');
    };
    mat.customProgramCacheKey = () => 'publicidadSinEspejo';
    return mat;
  }

  _lote(clave, material) {
    if (!this.lotes[clave]) this.lotes[clave] = { lote: new Lote(), material };
    return this.lotes[clave].lote;
  }

  // Posición 3D de la muestra i a una distancia lateral
  _p(i, lat, y = 0) {
    const t = this.t;
    i = ((i % t.N) + t.N) % t.N;
    return [t.x[i] + t.nx[i] * lat, y + t.alt[i], t.z[i] + t.nz[i] * lat]; // (+ la altura de la pista: cuestas)
  }

  // ---------- CINTA HORIZONTAL ----------
  // i0: muestra inicial; n: número de muestras; lat(i) → [latIzq, latDer]
  // y puede ser un número o [yIzq, yDer]; vEsc: metros por repetición de textura
  _cinta(lote, i0, n, lat, y, vEsc = 10, paso = 1) {
    const t = this.t;
    let anterior = null;
    for (let j = 0; j <= n; j += paso) {
      const i = i0 + Math.min(j, n);
      let [a, b] = lat(((i % t.N) + t.N) % t.N, j);
      let ya = Array.isArray(y) ? y[0] : y, yb = Array.isArray(y) ? y[1] : y;
      if (a < b) { [a, b] = [b, a]; [ya, yb] = [yb, ya]; } // a = izquierda
      const pa = this._p(i, a, ya), pb = this._p(i, b, yb);
      const v = (Math.min(j, n) * t.ds) / vEsc;
      // Normal: arriba, inclinada si la cinta está en pendiente (tribunas)
      const dy = yb - ya, dl = a - b;
      const k = ((i % t.N) + t.N) % t.N;
      const len = Math.hypot(dy, dl) || 1;
      const nxl = dy / len; // componente hacia la izquierda
      const ny = dl / len;
      const nx = t.nx[k] * nxl, nz = t.nz[k] * nxl;
      const va = lote.vertice(pa[0], pa[1], pa[2], nx, ny, nz, 0, v);
      const vb = lote.vertice(pb[0], pb[1], pb[2], nx, ny, nz, 1, v);
      if (anterior) {
        lote.triangulo(anterior[0], anterior[1], vb);
        lote.triangulo(anterior[0], vb, va);
      }
      anterior = [va, vb];
      if (j + paso > n && j < n) j = n - paso; // asegura cerrar justo en n
    }
  }

  // ---------- PARED VERTICAL ----------
  // La cara buena mira hacia la pista. Visto desde la pista, en una pared de la
  // IZQUIERDA el sentido de la marcha va hacia tu derecha, pero en una de la
  // DERECHA va hacia tu izquierda: ahí la coordenada U de la textura se invierte
  // (si no, los carteles se leen en espejo: "ASNOM") y los triángulos se dan
  // la vuelta para que la cara delantera siga mirando a la pista.
  _pared(lote, i0, n, lat, y0, y1, uEsc = 10, paso = 1) {
    const t = this.t;
    let anterior = null;
    for (let j = 0; j <= n; j += paso) {
      const jj = Math.min(j, n);
      const i = (((i0 + jj) % t.N) + t.N) % t.N;
      const l = lat(i, jj);
      const p0 = this._p(i, l, y0), p1 = this._p(i, l, y1);
      const izquierda = l > 0;
      const sg = izquierda ? -1 : 1; // mira hacia la pista
      const nx = t.nx[i] * sg, nz = t.nz[i] * sg;
      const u = ((izquierda ? 1 : -1) * jj * t.ds) / uEsc;
      const a = lote.vertice(p0[0], p0[1], p0[2], nx, 0, nz, u, 0);
      const b = lote.vertice(p1[0], p1[1], p1[2], nx, 0, nz, u, 1);
      if (anterior) {
        if (izquierda) {
          lote.triangulo(anterior[0], a, b);
          lote.triangulo(anterior[0], b, anterior[1]);
        } else {
          lote.triangulo(anterior[0], b, a);
          lote.triangulo(anterior[0], anterior[1], b);
        }
      }
      anterior = [a, b];
      if (j + paso > n && j < n) j = n - paso;
    }
  }

  // Caja orientada (para edificios, pilares, carteles...)
  _caja(lote, cx, cy, cz, ancho, alto, largo, angulo) {
    const g = new THREE.BoxGeometry(ancho, alto, largo);
    g.rotateY(angulo);
    g.translate(cx, cy, cz);
    const base = lote.pos.length / 3;
    const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv.array;
    for (let i = 0; i < p.length / 3; i++) lote.vertice(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], n[i * 3], n[i * 3 + 1], n[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]);
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) lote.triangulo(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
    g.dispose();
  }

  // (16-11) PARED CON GROSOR: las _pared son láminas de grosor cero y, vistas desde arriba, de lado o por la punta,
  // parecían de papel. _solido pone la cara (lote) donde iba la pared y, detrás (hacia fuera de la pista), otra cara,
  // la tapa de arriba y las dos tapas de las puntas, con loteResto (hormigón si no se dice).
  // grosor en m: CONFIG.graficos.grosorMuros lo multiplica (0 = como antes, láminas)
  _solido(lote, i0, n, lat, y0, y1, grosor, uEsc = 10, paso = 1, loteResto = null) {
    this._pared(lote, i0, n, lat, y0, y1, uEsc, paso);
    const g = grosor * (CONFIG.graficos.grosorMuros ?? 1);
    if (!g || n < 1) return; // (grosor negativo: crece hacia la pista, para muros con el coche justo detrás)
    const resto = loteResto || this._lote('hormigon', this.mat.hormigon), t = this.t;
    const atras = (i, j) => { const l = lat(i, j); return l + (l >= 0 ? g : -g); };
    this._pared(resto, i0, n, atras, y0, y1, uEsc, paso);
    this._cinta(resto, i0, n, (i, j) => [lat(i, j), atras(i, j)], y1, 10, paso);
    for (const j of [0, n]) { // tapas de las puntas
      const i = (((i0 + j) % t.N) + t.N) % t.N, l = lat(i, j), m = (l + atras(i, j)) / 2, p = this._p(i, m);
      this._caja(resto, p[0], p[1] + (y0 + y1) / 2, p[2], Math.abs(g), y1 - y0, 0.08, this._angulo(i));
    }
  }

  _angulo(i) {
    const t = this.t;
    i = ((i % t.N) + t.N) % t.N;
    return Math.atan2(t.tx[i], t.tz[i]);
  }

  // Divide un rango circular de muestras en tramos según una condición
  _tramos(condicion) {
    const t = this.t, tramos = [];
    let ini = -1;
    // Empezamos en un punto donde no se cumple para no partir un tramo en dos
    let arranque = 0;
    while (arranque < t.N && condicion(arranque)) arranque++;
    if (arranque >= t.N) return [[0, t.N]];
    for (let j = 1; j <= t.N; j++) {
      const i = (arranque + j) % t.N;
      const c = condicion(i);
      if (c && ini < 0) ini = arranque + j;
      if ((!c || j === t.N) && ini >= 0) {
        tramos.push([ini, arranque + j - ini]);
        ini = -1;
      }
    }
    return tramos;
  }

  // (15-11) Metros que hay que apartar algo puesto junto al muro de la pista (grada, grúa) para que quede detrás del
  // pit lane y de su muro exterior (carril + 7,5 m + 1 de margen). 0 fuera del pit lane.
  _detrasPit(i) {
    const t = this.t, b = t.boxes;
    if (!this._enBoxes(i)) return 0;
    const u = Utils.envolver(i * t.ds - b.entrada, t.L), muro = i >= 0 ? (b.lado > 0 ? t.muroIzq : t.muroDer)[i % t.N] : t.hwEn(i * t.ds);
    const atras = Math.max(Math.abs(t.lateralPitLane(Math.min(u, b.longitud))) + 8.5, b.uBox.some((x) => Math.abs(x - u) < b.separacion) ? Math.abs(b.lateralGaraje) + 2 : 0);
    return Math.max(0, atras - muro);
  }

  _enBoxes(i, margen = 0) {
    const b = this.t.boxes;
    const u = Utils.envolver(i * this.t.ds - b.entrada, this.t.L);
    return u < b.longitud + margen || u > this.t.L - margen;
  }

  // (12-11) Textura de la goma: negro que se desvanece hacia los bordes (con borde irregular) y vetas a lo largo,
  // como las marcas de las ruedas. u = de un lado al otro de la franja, v = a lo largo (repite cada ~20 m)
  _texGoma() {
    const W = 64, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), img = x.createImageData(W, H);
    let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    const borde = Array.from({ length: H }, (_, y) => 0.32 + 0.1 * Math.sin(y * 0.05) + 0.06 * Math.sin(y * 0.23 + 1) + 0.04 * (azar() - 0.5));
    const vetas = Array.from({ length: W }, () => 0.75 + 0.5 * azar());
    for (let y = 0; y < H; y++) for (let u = 0; u < W; u++) {
      const d = Math.abs(u / (W - 1) - 0.5) * 2;                     // 0 en el centro, 1 en el borde
      const k = Math.max(0, 1 - Math.pow(d / (0.6 + borde[y]), 2));  // desvanecido suave hacia los lados
      const a = Math.min(1, k * vetas[u] * (0.85 + 0.3 * azar()));
      const o = (y * W + u) * 4; img.data[o + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ---------- Asfalto, goma y líneas ----------
  _asfaltoYLineas() {
    const t = this.t, N = t.N, H = (i) => t.hwArr[((i % N) + N) % N]; // media anchura en la muestra i
    this._cinta(this._lote('asfalto', this.mat.asfalto), 0, N, (i) => [H(i), -H(i)], 0.02, 14);
    // La "goma" que dejan los coches en la línea de carrera (G = media anchura de la franja)
    // (12-11, el autor: «que no se vea tan claro, difuminado, con imperfecciones, no un rectángulo del mismo ancho»):
    // franja más ancha y de bordes suaves (la textura se desvanece hacia los lados), con un ancho que respira a lo largo
    // de la vuelta y el centro que se desvía un poco de la trazada (no todos pasan por el mismo sitio)
    const G = (this.vis.anchoGoma ?? 1.2) * 1.45;
    const ruido = (i, a, b, c) => Math.sin(i * a) * 0.5 + Math.sin(i * b + 1.7) * 0.3 + Math.sin(i * c + 4.1) * 0.2;
    this._cinta(this._lote('goma', this.mat.goma), 0, N, (i) => {
      const g = G * (0.85 + 0.25 * ruido(i, 0.031, 0.0071, 0.113)), c = t.linea[i] + 0.35 * ruido(i, 0.017, 0.0043, 0.061);
      return [c + g, c - g];
    }, 0.026, 20);
    const blanco = this._lote('blanco', this.mat.blanco);
    this._cinta(blanco, 0, N, (i) => [H(i) - 0.15, H(i) - 0.45], 0.03, 20);
    this._cinta(blanco, 0, N, (i) => [-H(i) + 0.45, -H(i) + 0.15], 0.03, 20);
  }

  // ---------- Pianos en las curvas ----------
  _pianos() {
    const t = this.t, H = (i) => t.hwArr[((i % t.N) + t.N) % t.N]; // media anchura en la muestra i
    const curva = new Uint8Array(t.N);
    // (circuitos.js → visual.umbralPiano: curvatura mínima para poner piano. Mónaco: 1/60, solo en las curvas de verdad;
    //  con 1/320 toda la calle llevaba pianos, porque allí casi nada es recto)
    const umbral = this.vis.umbralPiano ?? 1 / 320;
    for (let i = 0; i < t.N; i++) if (Math.abs(t.k[i]) > umbral) for (let d = -8; d <= 8; d++) curva[(i + d + t.N) % t.N] = 1;
    const lote = this._lote('piano', this.mat.piano);
    // Ancho del piano: más ancho en las chicanes si el circuito lo pide (visual.anchoPianoChicane)
    // (y en las zonas de circuitos.js → pianosAnchos: { sIni, sFin, ancho }, p. ej. los pianos grandes de la Nouvelle Chicane)
    const anchoZona = (i) => { const s = i * t.ds, z = (t.datos.pianosAnchos || []).find((z) => Utils.envolver(s - z.sIni, t.L) < Utils.envolver(z.sFin - z.sIni, t.L)); return z ? z.ancho : 0; };
    const A = (i) => anchoZona(i) || (this.zonaChicane[i] ? this.vis.anchoPianoChicane ?? 1.6 : 1.6);
    for (const [i0, n] of this._tramos((i) => curva[i])) {
      this._cinta(lote, i0, n, (i) => [H(i) + A(i), H(i)], 0.035, 3);
      this._cinta(lote, i0, n, (i) => [-H(i), -H(i) - A(i)], 0.035, 3);
    }
    // Pianos también en rectas (circuitos.js → pianosExtra: [{ sIni, sFin, lado }]; lado 1 = izquierda).
    // Silverstone: el de la izquierda de la recta Hamilton, que sigue desde Club (vídeo 3 s y 88 s)
    this._porZonas(t.datos.pianosExtra, (z, i0, n) => {
      for (const [a, m] of this._tramos((i) => Utils.envolver(i - i0, t.N) <= n && !curva[i]))
        this._cinta(lote, a, m, z.lado > 0 ? (i) => [H(i) + 1.6, H(i)] : (i) => [-H(i), -H(i) - 1.6], 0.035, 3);
    });
  }

  // Marca qué muestras son chicane (pianos anchos, escapatoria de asfalto) y dónde va
  // la grava, según los nombres de curva de visual.chicanes y visual.gravaEn.
  _zonasEspeciales() {
    const t = this.t, N = t.N, ds = t.ds;
    const marcar = (nombres, antes, despues) => {
      const z = new Uint8Array(N);
      for (const c of t.curvas) {
        if (!(nombres || []).includes(c.nombre)) continue;
        for (let s = c.sIni - antes; s <= c.sFin + despues; s += ds) z[t.indice(s)] = 1;
      }
      return z;
    };
    this.zonaChicane = marcar(this.vis.chicanes, 15, 15);
    this.zonaEscAsfalto = marcar(this.vis.chicanes, 140, 60); // la frenada y la propia chicane
    this.zonaGrava = this.vis.gravaEn ? marcar(this.vis.gravaEn, 40, 60) : null; // null = grava donde diga la curvatura
  }

  // ---------- Escapatorias de asfalto y grava ----------
  _escapatorias() {
    const t = this.t, N = t.N, H = (i) => t.hwArr[((i % N) + N) % N]; // media anchura en la muestra i
    const esc = this._lote('escapatoria', this.mat.escapatoria);
    // En las chicanes marcadas la escapatoria es de asfalto hasta donde iría la grava
    // (15-11) Antes el asfalto extra de las chicanes y la grava empezaban y acababan DE GOLPE (corte recto
    // contra el césped, p. ej. Catalunya curva 1-2). Ahora entran y salen en rampa suave (RAMPA metros) y el
    // borde exterior de la grava ondula un poco (ONDA metros) para que no parezca recortado con regla.
    const RAMPA = 30, ONDA = 0.9;
    const fa = this._suavizarMascara((i) => (this.zonaEscAsfalto[i] ? 1 : 0), RAMPA / 2); // 0..1 asfalto de chicane
    const finAsfalto = (i, lado) => {
      const g = lado > 0 ? t.gravaIzq : t.gravaDer, muro = lado > 0 ? t.muroIzq : t.muroDer;
      return Math.min(H(i) + 7.5 + g[i] * fa[i], muro[i] - 0.5);
    };
    this._cinta(esc, 0, N, (i) => [finAsfalto(i, 1), H(i) - 0.2], 0.012, 14, 2);
    this._cinta(esc, 0, N, (i) => [-H(i) + 0.2, -finAsfalto(i, -1)], 0.012, 14, 2);
    const grava = this._lote('grava', this.mat.grava);
    const hayGrava = (i) => !this.zonaEscAsfalto[i] && (!this.zonaGrava || this.zonaGrava[i]);
    for (const lado of [1, -1]) {
      const g = lado > 0 ? t.gravaIzq : t.gravaDer, muro = lado > 0 ? t.muroIzq : t.muroDer;
      const manual = lado > 0 ? t.manualIzq : t.manualDer; // ahí manda la escapatoria puesta a mano
      const vale = (i) => hayGrava(i) && !manual[i] && !(lado === t.boxes.lado && this._enBoxes(i, 40));
      const fg = this._rampaDentro(vale, RAMPA); // 1 en el centro de la zona, baja a 0 en sus bordes
      // La grava empieza justo donde acaba el asfalto (sin hueco ni solape) y su anchura se multiplica por la rampa
      const lim = (i) => {
        const ini = finAsfalto(i, lado) - 0.02;
        const fin = Math.min(H(i) + 7.5 + g[i] * fg[i] + fg[i] * this._onda(i, lado, ONDA), muro[i] - 0.6);
        return [ini, Math.max(ini, fin)];
      };
      for (const [i0, n] of this._tramos((i) => g[i] * fg[i] > 0.3 && lim(i)[1] - lim(i)[0] > 0.1)) {
        this._cinta(grava, i0, n, (i) => { const [a, b] = lim(i); return [lado * a, lado * b]; }, 0.01, 8, 1);
      }
    }
    this._escapatoriasManuales();
  }

  // (15-11) Ondulación suave del borde exterior (metros), distinta en cada lado: borde "natural"
  _onda(i, lado, amp) {
    const s = i * this.t.ds;
    return amp * (0.6 * Math.sin(s / 23 + lado * 1.3) + 0.4 * Math.sin(s / 9.7 + lado * 2.1));
  }

  // (15-11) Media móvil circular de una máscara 0/1 (radio en metros): bordes en rampa hacia los dos lados
  _suavizarMascara(cond, radio) {
    const t = this.t, N = t.N, r = Math.max(1, Math.round(radio / t.ds)), m = new Float32Array(N), out = new Float32Array(N);
    for (let i = 0; i < N; i++) m[i] = cond(i);
    let suma = 0;
    for (let d = -r; d <= r; d++) suma += m[((d % N) + N) % N];
    for (let i = 0; i < N; i++) {
      out[i] = suma / (2 * r + 1);
      suma += m[(i + r + 1) % N] - m[((i - r) % N + N) % N];
    }
    return out;
  }

  // (15-11) Rampa DENTRO de una zona: 0 en su borde, 1 a partir de `largo` metros hacia dentro (no se sale de la zona)
  _rampaDentro(cond, largo) {
    const t = this.t, N = t.N, dF = new Float32Array(N), dB = new Float32Array(N), out = new Float32Array(N);
    let d = 1e9;
    for (let k = 0; k < 2 * N; k++) { const i = k % N; d = cond(i) ? d + t.ds : 0; dF[i] = d; }
    d = 1e9;
    for (let k = 2 * N - 1; k >= 0; k--) { const i = k % N; d = cond(i) ? d + t.ds : 0; dB[i] = d; }
    for (let i = 0; i < N; i++) out[i] = Utils.suave(0, largo, Math.min(dF[i], dB[i]));
    return out;
  }

  // Escapatorias puestas a mano en circuitos.js (ver Trazado._escapatoriasManuales)
  _escapatoriasManuales() {
    const t = this.t, N = t.N, H = (i) => t.hwArr[((i % N) + N) % N];
    for (const e of t.escManual) {
      let lote, desde = 0.2, y = 0.016;
      // (15-11) la grava a mano empezaba a 4 m, ENCIMA del asfalto de escapatoria (que llega a 7,5 m) y a la
      // misma altura: parpadeaba. Ahora empieza donde acaba ese asfalto
      if (e.tipo === 'grava') { lote = this._lote('grava', this.mat.grava); desde = 7.5; y = 0.01; }
      else if (e.tipo === 'pintada') {
        const clave = 'pintada' + (e.color || '') + (e.lisa ? 'L' : '') + (e.bandas ? e.bandas.join('') : '');
        lote = this.lotes[clave] ? this.lotes[clave].lote : this._lote(clave, this._matPintada(e.color, e.lisa, e.bandas));
      } else if (e.tipo === 'cebra') { // asfalto con franjas rojas y blancas en diagonal (chicane de Mónaco)
        if (!this.mat.cebra) { this.mat.cebra = new THREE.MeshStandardMaterial({ map: Texturas.cebra(), roughness: 0.8 }); this._capa(this.mat.cebra, 0); }
        lote = this._lote('cebra', this.mat.cebra);
      } else { lote = this._lote('escapatoria', this.mat.escapatoria); desde = 7.5; y = 0.012; } // (15-11) sigue al asfalto automático, sin pisarlo (parpadeo)
      // (15-11) borde exterior con una ligera ondulación (más fuerte cuanto más ancha), no una línea de regla
      const amax = Math.max(...e.anchos) || 1;
      this._cinta(lote, e.i0, e.n, (i, j) => {
        const w = e.anchos[Math.min(j, e.n)], onda = e.tipo === 'grava' ? this._onda(i, e.lado, 1.0) * (w / amax) : 0;
        return [e.lado * (H(i) + desde), e.lado * (H(i) + Math.max(desde + 0.05, w + onda))];
      }, y, 10, 1);
    }
  }

  _matPintada(color, lisa = false, bandas = null) {
    const m = new THREE.MeshStandardMaterial({ map: Texturas.escapatoriaPintada(color, lisa ? false : bandas || true), roughness: 0.85 });
    this._capa(m, 0); // encima de la escapatoria y la grava, debajo del asfalto y los pianos
    return m;
  }

  // ---------- Muros con publicidad y vallas ----------
  _muros() {
    const t = this.t;
    const trozo = 30; // muestras por trozo de publicidad (~60 m; así el cartel de publicidadZonas cae en su sitio)
    for (const lado of [1, -1]) {
      const muro = lado > 0 ? t.muroIzq : t.muroDer;
      // (dentro del túnel no hay muros con publicidad ni valla: solo guardarraíl, ver _tunel)
      const tu = t.datos.tunel, enTunel = (i) => tu && Utils.envolver(i * t.ds - tu.sIni, t.L) < Utils.envolver(tu.sFin - tu.sIni, t.L);
      const valido = (i) => !(lado === t.boxes.lado && this._enBoxes(i, 15)) && !enTunel(i) && !this._enZona(t.datos.murosAltos, i, lado);
      for (const [i0, n] of this._tramos(valido)) {
        for (let j = 0; j < n; j += trozo) {
          const largo = Math.min(trozo, n - j);
          // (circuitos.js → publicidadZonas: en esos metros va siempre esa marca, como en el vídeo; si no, al azar)
          const sT = (i0 + j + Math.min(trozo, n - j) / 2) * t.ds, zona = (t.datos.publicidadZonas || []).find((z) => (!z.lado || z.lado === lado) && Utils.envolver(sT - z.sIni, t.L) < Utils.envolver(z.sFin - z.sIni, t.L));
          // (circuitos.js → visual.guardarrail: donde no hay zona de publicidad, guardarraíl de metal desnudo de 3 bandas,
          //  como en las calles de Mónaco; si no, cartel al azar como siempre)
          if (!zona && this.vis.guardarrail) {
            if (!this.mat.guardarrail) this.mat.guardarrail = new THREE.MeshStandardMaterial({ map: Texturas.guardarrail(), roughness: 0.5, metalness: 0.05, emissive: '#2a2c2e', side: THREE.DoubleSide }); // (chapa clara al sol, como en las fotos)
            this._solido(this._lote('guardarrail', this.mat.guardarrail), i0 + j, largo, (i) => lado * muro[i], 0, 1.1, 0.25, 4, 2, this._lote('gris', this.mat.gris)); // (16-11: con grosor)
            continue;
          }
          const marca = zona ? zona.marca % this.matPublicidad.length : Math.floor(this.rnd() * this.matPublicidad.length);
          const lote = this._lote('pub' + marca, this.matPublicidad[marca]);
          this._solido(lote, i0 + j, largo, (i) => lado * muro[i], 0, 1.1, 0.4, 12, 2); // (16-11: muro de hormigón con grosor, no una lámina)
        }
        // Valla de seguridad encima (salvo en circuitos.js → sinValla: la barrera baja de la chicane de Mónaco)
        const conValla = (i) => !this._enZona(t.datos.sinValla, ((i % t.N) + t.N) % t.N, lado);
        for (const [a, m] of this._tramos((i) => Utils.envolver(i - i0, t.N) <= n && conValla(i))) {
          this._pared(this._lote('red', this.mat.red), a, m, (i) => lado * (muro[i] + 0.3), 1.1, 4, 1.5, 2);
          const postes = this._lote('gris', this.mat.gris);
          for (let j = 0; j < m; j += 6) {
            const i = a + j, p = this._p(i, lado * (muro[(i % t.N + t.N) % t.N] + 0.35));
            this._caja(postes, p[0], p[1] + 2.05, p[2], 0.12, 4.1, 0.12, this._angulo(i));
          }
        }
      }
    }
  }

  // ---------- Pit lane, muro de boxes y garajes ----------
  _boxes() {
    const t = this.t, b = t.boxes, ds = t.ds, lado = b.lado;
    const i0 = Math.round(b.entrada / ds), n = Math.round(b.longitud / ds);
    const u = (j) => j * ds;
    let zona = (j) => Utils.suave(b.rampa - 20, b.rampa + 25, u(j)) * (1 - Utils.suave(b.longitud - b.rampa - 25, b.longitud - b.rampa + 20, u(j)));
    // (circuitos.js → boxesZonaGarajes: true) la zona ancha de trabajo (hasta la fachada) solo delante de los
    // garajes; en el resto, solo el carril. Interlagos: la salida larga que baja por la S de Senna es una carretera estrecha
    if (t.datos.boxesZonaGarajes) {
      const gA = b.uBox[0] - b.separacion, gB = b.uBox[b.uBox.length - 1] + b.separacion, z0 = zona;
      zona = (j) => z0(j) * Utils.suave(gA - 40, gA, u(j)) * (1 - Utils.suave(gB, gB + 40, u(j)));
    }

    // Superficie del pit lane
    this._cinta(this._lote('pitlane', this.mat.pitlane), i0, n, (i, j) => {
      const c = Math.abs(t.lateralPitLane(u(j)));
      const exterior = Math.max(c + 5.5, zona(j) * (Math.abs(b.lateralGaraje) + 1));
      return [lado * (c - 5.5), lado * exterior];
    }, 0.018, 14, 2);

    // Línea que separa el carril rápido de la zona de trabajo + líneas de límite de velocidad
    const blanco = this._lote('blanco', this.mat.blanco);
    const jIni = Math.round((b.rampa + 20) / ds), jFin = Math.round((b.longitud - b.rampa - 20) / ds);
    this._cinta(blanco, i0 + jIni, jFin - jIni, () => [lado * (b.hw + 17.3), lado * (b.hw + 17.6)], 0.028, 10);
    for (const uu of [b.rampa, b.longitud - b.rampa]) {
      const j = Math.round(uu / ds);
      this._cinta(blanco, i0 + j, 1, () => {
        const c = Math.abs(t.lateralPitLane(uu));
        return [lado * (c - 5.5), lado * (c + 5.5)];
      }, 0.028, 10);
    }

    // Muro de boxes
    // Empieza (y acaba) donde el coche que entra ya ha cruzado su línea: medio coche + 0,6 m
    // de margen por fuera del muro. (Antes empezaba antes y los coches lo atravesaban)
    const fuera = (uu) => Math.abs(t.lateralPitLane(uu)) - 1.6 > Math.abs(b.lateralMuro);
    let uM0 = b.rampa * 0.55, uM1 = b.longitud - b.rampa * 0.55;
    while (uM0 < b.longitud / 2 && !fuera(uM0)) uM0 += 1;
    while (uM1 > b.longitud / 2 && !fuera(uM1)) uM1 -= 1;
    // (16-11) Con bordes (Interlagos) el muro no empieza hasta que el coche que entra ya está en el carril (lo cruzaba en diagonal)
    if (t.datos.boxesBordes) uM0 = Math.max(uM0, (b.rampaLateral || b.rampa) * 0.5 + 8);
    const jm0 = Math.round(uM0 / ds), jm1 = Math.round(uM1 / ds);
    // (15-11, física) Raya blanca continua entre la pista y el carril de boxes en la entrada y en la salida (donde aún no
    // hay muro), como en la F1: sale del borde de la pista y se va abriendo con el carril
    if (!t.datos.boxesBordes) {
      const raya = (j) => { const uu = u(j), c = Math.max(t.hwEn(b.entrada + uu) - 0.45, Math.abs(t.lateralPitLane(uu)) - 5.5); return [lado * c, lado * (c + 0.3)]; };
      this._cinta(blanco, i0, jm0, (i, j) => raya(j), 0.03, 10);
      this._cinta(blanco, i0 + jm1, n - jm1, (i, j) => raya(jm1 + j), 0.03, 10);
    }
    // (15-11, circuitos) El muro se arrima a la pista donde el carril se le acerca (Interlagos, S de Senna): ya no lo atraviesan
    const muroJ = (i, j) => t.lateralMuroPit(u(jm0 + j));
    this._solido(this._lote('hormigon', this.mat.hormigon), i0 + jm0, jm1 - jm0, muroJ, 0, 1.25, -0.5, 10, 2); // (16-11: con grosor, hacia la pista: detrás, a veces, el coche va a 1,6 m)
    this._pared(this._lote('red', this.mat.red), i0 + jm0, jm1 - jm0, muroJ, 1.25, 4.2, 1.5, 2);
    // Muros exteriores en las rampas de entrada y salida
    const hormigon = this._lote('hormigon', this.mat.hormigon);
    const jr = Math.round((b.rampa + 25) / ds);
    if (t.datos.boxesBordes) this._bordesPitLane(t.datos.boxesBordes, i0, n, zona, uM0, uM1); // (Interlagos: muro y talud por fuera, separación con la pista)
    else this._solido(hormigon, i0, Math.round(((b.rampaLateral || b.rampa) + 25) / ds), (i, j) => lado * (Math.abs(t.lateralPitLane(u(j))) + 7.5), 0, 1.2, 0.4, 10, 2); // (14-11, #9: el muro de la entrada sigue el desvío, que ahora es más largo)
    if (!t.datos.boxesBordes) this._solido(hormigon, i0 + n - jr, jr, (i, j) => lado * (Math.abs(t.lateralPitLane(u(n - jr + j))) + 7.5), 0, 1.2, 0.4, 10, 2);

    // Por equipo: marcas en el suelo, puesto en el muro y garaje
    const im = this._lote('oscuro', this.mat.oscuro);
    EQUIPOS.forEach((eq, k) => {
      const s = b.entrada + b.uBox[k];
      const i = t.indice(s), ang = this._angulo(i);
      const colorEq = new THREE.MeshStandardMaterial({ color: eq.colores.principal, roughness: 0.6 });
      this._capa(colorEq, -3);
      const loteEq = this._lote('eq' + eq.id, colorEq);
      // Rectángulo pintado donde para el coche
      const ib = Math.round((s - 4) / ds);
      this._cinta(loteEq, ib, Math.round(8 / ds), () => [b.lateralParada - lado * 1.6, b.lateralParada + lado * 1.6], 0.024, 8);
      // Puesto de mando del equipo en el muro
      // (16-11) Si el carril se arrima al muro (Mónaco, carril de salida), el puesto tocaba a los coches: entonces va al
      // otro lado del muro (hacia la pista) si cabe sin pisar el asfalto, y si no cabe, no se pone
      const muroU = Math.abs(t.lateralMuroPit(b.uBox[k])), hueco = Math.min(...[-3, 0, 3].map((du) => Math.abs(t.lateralPitLane(b.uBox[k] + du)))) - muroU; // (a lo largo de sus 5 m)
      const ladoPuesto = hueco >= 4.9 ? 1 : (muroU - t.hwEn(s) >= 3 ? -1 : 0);
      if (ladoPuesto) {
        const pm = this._p(i, lado * (muroU + ladoPuesto * (ladoPuesto > 0 ? 1.6 : 2)));
        this._caja(im, pm[0], pm[1] + 1.2, pm[2], 1.4, 2.4, 5, ang);
        this._caja(loteEq, pm[0], pm[1] + 2.5, pm[2], 1.8, 0.2, 5.6, ang);
      }
      // Fachada del garaje
      const fachada = new THREE.Mesh(
        new THREE.PlaneGeometry(b.separacion - 1, 7),
        new THREE.MeshStandardMaterial({ map: Texturas.garaje(eq), roughness: 0.7 })
      );
      const pg = this._p(i, b.lateralGaraje - lado * 0.05, 3.5);
      fachada.position.set(pg[0], pg[1], pg[2]); // (pg ya va a 3,5 m sobre la pista)
      // El plano mira hacia +Z por defecto: lo giramos para que mire a la pista
      const normal = new THREE.Vector3(t.nx[i] * -lado, 0, t.nz[i] * -lado);
      fachada.lookAt(fachada.position.clone().add(normal));
      fachada.receiveShadow = true;
      this.grupo.add(fachada);
    });

    // Edificio de boxes (bajo + planta de hospitality acristalada)
    const ini = b.entrada + b.uBox[0] - b.separacion / 2 - 6, fin = b.entrada + b.uBox[EQUIPOS.length - 1] + b.separacion / 2 + 6;
    const largo = fin - ini, centro = ini + largo / 2, ic = t.indice(centro), ang = this._angulo(ic);
    const g0 = Math.abs(b.lateralGaraje);
    const pB = this._p(ic, lado * (g0 + 11));
    // (Mónaco: el edificio sigue la curva de la recta; una caja recta de ~290 m se salía por los lados)
    if (t.datos.edificioBoxes !== 'monaco' && t.datos.edificioBoxes !== 'interlagos') {
      this._caja(this._lote('hormigon', this.mat.hormigon), pB[0], pB[1], pB[2], 22, 0.01, largo, ang);
      this._caja(this._lote('gris', this.mat.gris), pB[0], pB[1] + 3.5, pB[2], 22, 7, largo, ang);
    }
    if (t.datos.edificioBoxes === 'wing') this._wing(ini, fin, g0, lado); // (Silverstone: el edificio Wing)
    else if (t.datos.edificioBoxes === 'monaco') this._boxesMonaco(ini, fin, g0, lado); // (Mónaco: garajes de 2 plantas del puerto)
    else if (t.datos.edificioBoxes === 'interlagos') this._boxesInterlagos(ini, fin, g0, lado); // (Interlagos: blanco, acristalado y con grada encima)
    else if (t.datos.edificioBoxes === 'monza') this._boxesMonza(ini, fin, g0, lado); // (Monza: cristal inclinado y podio volado)
    else {
      const pC = this._p(ic, lado * (g0 + 13));
      this._caja(this._lote('cristal', this.mat.cristal), pC[0], pC[1] + 9.5, pC[2], 18, 5, largo - 4, ang);
      const pT = this._p(ic, lado * (g0 + 10));
      this._caja(this._lote('techo', this.mat.blanco), pT[0], pT[1] + 12.3, pT[2], 26, 0.6, largo + 6, ang);
      // Torre de control al final
      const it = t.indice(fin + 20), pt = this._p(it, lado * (g0 + 8));
      this._caja(this._lote('techo', this.mat.blanco), pt[0], pt[1] + 11, pt[2], 12, 22, 12, ang);
      this._caja(this._lote('cristal', this.mat.cristal), pt[0], pt[1] + 19, pt[2], 12.4, 3.5, 12.4, ang);
    }
    this._edificioBoxes = { ini, fin };
    if (t.datos.boxesTunel) this._tunelBoxes(t.datos.boxesTunel);
    // Zona ocupada por el pit lane y el edificio (sin árboles)
    for (let u = 0; u <= b.longitud + 60; u += 20) {
      const p = this._p(t.indice(b.entrada + u), lado * (g0 + 6));
      this.ocupado.push([p[0], p[2], 34]);
    }
  }

  // ---------- Boxes de Monza (circuitos.js → edificioBoxes: 'monza') ----------
  // Como en la foto de Commons (referencias/monza/fotos/01.jpg): encima de los garajes, dos plantas de cristal espejo
  // que se INCLINAN hacia el pit lane, con brazos blancos de acero arriba; franja roja en el suelo entre el carril
  // rápido y la zona de trabajo; torre blanca al final (lado del Rettifilo) y el podio volado sobre el pit lane
  _boxesMonza(ini, fin, g0, lado) {
    const t = this.t, b = t.boxes, i0 = t.indice(ini), n = Math.round((fin - ini) / t.ds);
    if (!this.mat.monzaCristal) {
      // (espejo que refleja el cielo: claro y azulado; sin mapa de entorno, con metal alto salía negro)
      this.mat.monzaCristal = new THREE.MeshStandardMaterial({ color: '#b8c8d6', roughness: 0.25, metalness: 0.3, emissive: '#3c5266', side: THREE.DoubleSide });
      this.mat.monzaBlanco = new THREE.MeshStandardMaterial({ color: '#f2f3f1', roughness: 0.55, side: THREE.DoubleSide });
      this.mat.monzaRojo = new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.7 });
      this._capa(this.mat.monzaRojo, -3);
    }
    const blanco = this._lote('monzaBlanco', this.mat.monzaBlanco), cristal = this._lote('monzaCristal', this.mat.monzaCristal);
    const gris = this._lote('gris', this.mat.gris);
    // Cristal inclinado: una sola superficie de 7 m (abajo, sobre la fachada) a 15,4 m (arriba, 3,3 m más hacia la pista)
    const inclinada = (lote, y0, y1, d0, d1) => {
      let ant = null;
      for (let j = 0; j <= n; j += 2) {
        const i = (i0 + Math.min(j, n)) % t.N, p0 = this._p(i, lado * d0, y0), p1 = this._p(i, lado * d1, y1);
        const a = lote.vertice(p0[0], p0[1], p0[2], -t.nx[i] * lado, 0.4, -t.nz[i] * lado, j * t.ds / 12, 0);
        const c = lote.vertice(p1[0], p1[1], p1[2], -t.nx[i] * lado, 0.4, -t.nz[i] * lado, j * t.ds / 12, 1);
        if (ant) { lote.triangulo(ant[0], a, c); lote.triangulo(ant[0], c, ant[1]); }
        ant = [a, c];
      }
    };
    inclinada(cristal, 7, 15.4, g0 - 0.3, g0 - 3.6);
    for (const f of [0.36, 0.68]) inclinada(gris, 7 + 8.4 * f, 7.15 + 8.4 * f, g0 - 0.32 - 3.3 * f, g0 - 0.32 - 3.3 * (f + 0.018)); // perfiles
    this._pared(gris, i0, n, () => lado * (g0 - 0.2), 6.6, 7, 10, 2); // canto entre garajes y cristal
    // Tejado blanco (con canto) y brazos de acero que vuelan hacia la pista
    this._cinta(blanco, i0, n, () => [lado * (g0 - 5.5), lado * (g0 + 22)], 15.6, 10, 2);
    this._pared(blanco, i0, n, () => lado * (g0 - 5.5), 15.6, 16.2, 10, 2);
    // (16-11) Pared de atrás y paredes de las puntas de las plantas de cristal (antes, de lado o por detrás, el cristal y el
    // tejado flotaban como láminas sobre el bloque gris)
    this._pared(blanco, i0, n, () => lado * (g0 + 22), 7, 15.6, 10, 2);
    for (const j of [0, n]) {
      const i = (i0 + j) % t.N, p = this._p(i, lado * (g0 + 9));
      this._caja(blanco, p[0], p[1] + 11.3, p[2], 26, 8.6, 0.4, this._angulo(i));
    }
    for (let j = 0; j <= n; j += 6) {
      const i = (i0 + j) % t.N, p = this._p(i, lado * (g0 - 3.2));
      this._caja(blanco, p[0], p[1] + 15.3, p[2], 4.6, 0.4, 0.4, this._angulo(i));
    }
    // Franja roja en el suelo del pit lane (entre el carril rápido y la zona de trabajo), en toda la zona de garajes
    const rojo = this._lote('monzaRojo', this.mat.monzaRojo);
    this._cinta(rojo, i0, n, () => [lado * (b.hw + 16.0), lado * (b.hw + 17.3)], 0.026, 10);
    // Torre blanca al final, del lado del Rettifilo
    const it = t.indice(fin + 18), pt = this._p(it, lado * (g0 + 8)), ang = this._angulo(it);
    this._caja(blanco, pt[0], pt[1] + 13, pt[2], 10, 26, 10, ang);
    this._caja(cristal, pt[0], pt[1] + 23, pt[2], 10.4, 4, 10.4, ang);
    // Podio: plataforma que vuela desde el edificio por encima del pit lane hasta el muro (a ~70 % del edificio)
    const ip = t.indice(ini + (fin - ini) * 0.7), angP = this._angulo(ip);
    const dentro = g0 + 2, fuera = Math.abs(b.lateralMuro) - 1, pc = this._p(ip, lado * (dentro + fuera) / 2);
    this._caja(blanco, pc[0], pc[1] + 12.2, pc[2], dentro - fuera, 1.2, 16, angP);
    this._caja(rojo, pc[0], pc[1] + 11.5, pc[2], dentro - fuera + 0.1, 0.3, 16.1, angP); // canto rojo
  }

  // ---------- Boxes de Mónaco (circuitos.js → edificioBoxes: 'monaco') ----------
  // Como en la foto de Commons (referencias/monaco_refs/Circuit_de_Monaco/Pit_Lane_Monaco_IMG_1194_jpg.jpg): planta
  // baja de garajes con persianas grises y, encima, palcos de cristal que vuelan ~3 m sobre el pit lane, con
  // suelo blanco curvo, franja roja, franja de cuadros y tejado blanco. Sin torre de control. Todo sigue la curva.
  _boxesMonaco(ini, fin, g0, lado) {
    const t = this.t, i0 = t.indice(ini), n = Math.round((fin - ini) / t.ds), F = 12; // F: fondo del edificio (m)
    if (!this.mat.monPersiana) {
      this.mat.monPersiana = new THREE.MeshStandardMaterial({ map: Texturas.persiana(), roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
      this.mat.monCristal = new THREE.MeshStandardMaterial({ color: '#9fb6c4', roughness: 0.12, metalness: 0.5, emissive: '#2a3a44', side: THREE.DoubleSide });
      this.mat.monRojo = new THREE.MeshStandardMaterial({ color: '#d32222', roughness: 0.6, side: THREE.DoubleSide });
      this.mat.monBlanco = new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.6, emissive: '#3a3a38', side: THREE.DoubleSide });
    }
    const L = (d) => () => lado * d;
    const pers = this._lote('monPersiana', this.mat.monPersiana), cristal = this._lote('monCristal', this.mat.monCristal);
    const blanco = this._lote('monBlanco', this.mat.monBlanco), rojo = this._lote('monRojo', this.mat.monRojo);
    // Planta baja: persianas (detrás de los carteles de cada equipo quedan las juntas), paredes y suelo
    this._pared(pers, i0, n, L(g0 + 0.1), 0, 7, 6, 2);
    this._pared(pers, i0, n, L(g0 + F), 0, 7, 6, 2);        // pared de atrás (la ve el puerto)
    this._cinta(this._lote('hormigon', this.mat.hormigon), i0, n, (i) => [lado * g0, lado * (g0 + F)], 0.01, 10, 2);
    // Palcos: suelo blanco que vuela 3 m, franja roja en su canto, cristal y tejado blanco
    this._cinta(blanco, i0, n, (i) => [lado * (g0 - 3), lado * (g0 + F)], 7, 10, 2);
    this._pared(blanco, i0, n, L(g0 - 3), 6.6, 7.6, 10, 2);
    this._pared(rojo, i0, n, L(g0 - 3.05), 7.25, 7.45, 10, 2);
    this._pared(cristal, i0, n, L(g0 - 2.4), 7.6, 11.4, 10, 2);
    this._pared(this._lote('cuadros', this.mat.cuadros), i0, n, L(g0 - 2.45), 11.4, 11.8, 2, 2);
    this._pared(cristal, i0, n, L(g0 + F), 7.6, 11.8, 10, 2);
    this._cinta(blanco, i0, n, (i) => [lado * (g0 - 3.6), lado * (g0 + F + 0.5)], 12.2, 10, 2);
    this._pared(blanco, i0, n, L(g0 - 3.6), 11.8, 12.2, 10, 2);
    // Separaciones blancas entre palcos (una por equipo) y paredes de los extremos
    const b = t.boxes;
    for (let k = 0; k <= EQUIPOS.length; k++) {
      const s = k < EQUIPOS.length ? b.entrada + b.uBox[k] - b.separacion / 2 : b.entrada + b.uBox[k - 1] + b.separacion / 2;
      const i = t.indice(s), p = this._p(i, lado * (g0 + (F - 3) / 2));
      this._caja(blanco, p[0], p[1] + 9.6, p[2], F + 3, 4.4, 0.4, this._angulo(i));
    }
    for (const s of [ini, fin]) {
      const i = t.indice(s), p = this._p(i, lado * (g0 + F / 2));
      this._caja(pers, p[0], p[1] + 6, p[2], F, 12, 0.3, this._angulo(i));
    }
  }

  // ---------- Bordes del pit lane (circuitos.js → boxesBordes: { marca }) ----------
  // Interlagos (vídeo 68-70 s): la entrada se separa de la pista con un morro de franjas negras y amarillas y un
  // muro verde; por fuera, franja de césped, muro con publicidad y valla. Antes el asfalto acababa en el aire
  // (el césped de alrededor queda más bajo): debajo del muro va un zócalo de hormigón y, detrás, un talud de césped.
  _bordesPitLane(cfg, i0, n, zona, uM0, uM1) {
    const t = this.t, b = t.boxes, lado = b.lado, ds = t.ds, hw = b.hw, g0 = Math.abs(b.lateralGaraje);
    const u = (j) => j * ds, c = (j) => Math.abs(t.lateralPitLane(u(j)));
    if (!this.mat.cespedPit) this.mat.cespedPit = new THREE.MeshStandardMaterial({ color: t.datos.cesped || '#5a8f3a', roughness: 1, side: THREE.DoubleSide });
    if (!this.mat.chevron) this.mat.chevron = new THREE.MeshStandardMaterial({ map: Texturas.chevron(), roughness: 0.6 });
    const k = (cfg.marca ?? 0) % this.matPublicidad.length, pub = this._lote('pub' + k, this.matPublicidad[k]);
    const hormigon = this._lote('hormigon', this.mat.hormigon), cesped = this._lote('cespedPit', this.mat.cespedPit);
    // Tramo del edificio (ahí la fachada hace de borde) y del túnel (tiene sus paredes)
    const uIni = b.uBox[0] - b.separacion / 2 - 6, uFin = b.uBox[b.uBox.length - 1] + b.separacion / 2 + 6;
    const tb = t.datos.boxesTunel, uT0 = tb ? Utils.envolver(tb.sIni - b.entrada, t.L) : -1, uT1 = tb ? Utils.envolver(tb.sFin - b.entrada, t.L) : -1;
    const E = (j) => Math.max(c(j) + 5.5, zona(j) * (g0 + 1)), W = (j) => E(j) + 2;
    const fuera = (j) => (u(j) < uIni || u(j) > uFin) && !(u(j) > uT0 - 4 && u(j) < uT1 + 4);
    for (const [a, m] of this._tramosJ(n, fuera)) {
      this._cinta(cesped, i0 + a, m, (i, j) => [lado * E(a + j), lado * W(a + j)], 0.012, 10, 2);
      this._pared(hormigon, i0 + a, m, (i, j) => lado * W(a + j), -4, 0, 10, 2);
      this._solido(pub, i0 + a, m, (i, j) => lado * W(a + j), 0, 1.1, 0.4, 12, 2);
      this._pared(this._lote('red', this.mat.red), i0 + a, m, (i, j) => lado * (W(a + j) + 0.3), 1.1, 3.2, 1.5, 2);
      this._cinta(cesped, i0 + a, m, (i, j) => [lado * (W(a + j) + 0.05), lado * (W(a + j) + 9)], [0, -4.5], 10, 2); // talud
    }
    // Asfalto del pit lane hasta el muro de boxes (antes quedaba una franja de césped hundida entre los dos)
    this._cinta(this._lote('pitlane', this.mat.pitlane), i0, n, (i, j) => [lado * Math.min(hw + 5, c(j) - 5.5), lado * (c(j) - 5.4)], 0.018, 14, 2);
    // Separación con la pista: muro verde a 1,8 m del borde del carril, desde el morro hasta el muro de boxes
    const L = (j) => Math.min(hw + 5, c(j) - 1.8);
    // (16-11) En la entrada, el coche se pasa de la pista al carril en los primeros (rampaLateral/2) m (carrera.js, «Posición
    // lateral dentro del pit lane»): si el muro verde empieza antes, lo cruza en diagonal (Interlagos, 33 veces por carrera).
    // Ahora empieza cuando el coche ya está en el carril.
    const uSep0 = (b.rampaLateral || b.rampa) * 0.5 + 8;
    const sep = (j) => L(j) >= hw + 0.8 && ((u(j) < uM0 + 6 && u(j) > uSep0 - 4) || u(j) > uM1 - 6);
    for (const [a, m] of this._tramosJ(n, sep)) {
      if (m < 2) continue;
      this._pared(pub, i0 + a, m, (i, j) => lado * L(a + j), 0, 1.1, 12, 1);
      this._pared(pub, i0 + a, m, (i, j) => lado * (L(a + j) + 0.5), 0, 1.1, 12, 1);
      this._cinta(hormigon, i0 + a, m, (i, j) => [lado * L(a + j), lado * (L(a + j) + 0.5)], 1.1, 10, 1);
      // Morro con franjas negras y amarillas (en la punta que mira a los coches que llegan)
      const jn = u(a) < b.longitud / 2 ? a : a + m, i = i0 + jn, p = this._p(i, lado * (L(jn) + 0.25));
      this._caja(this._lote('chevron', this.mat.chevron), p[0], p[1] + 0.6, p[2], 0.9, 1.2, 2.2, this._angulo(i));
    }
  }

  // Tramos seguidos [inicio, largo] de j = 0..n donde se cumple la condición
  _tramosJ(n, cond) {
    const r = []; let a = -1;
    for (let j = 0; j <= n; j++) {
      if (cond(j)) { if (a < 0) a = j; }
      else if (a >= 0) { r.push([a, j - 1 - a]); a = -1; }
    }
    if (a >= 0) r.push([a, n - a]);
    return r.filter(([, m]) => m > 0);
  }

  // ---------- Boxes de Interlagos (circuitos.js → edificioBoxes: 'interlagos') ----------
  // Vídeo onboard 2,5-3,5 s: edificio blanco y alto. Planta baja de garajes, dos pisos de cristal azulado con
  // forjados blancos que vuelan sobre el pit lane, y encima una grada con público bajo una visera blanca.
  // Al final (lado de la S de Senna) un bloque de cristal más alto. Todo cerrado (frente, fondo, techo y testeros)
  // y siguiendo la curva de la recta.
  _boxesInterlagos(ini, fin, g0, lado) {
    const t = this.t, i0 = t.indice(ini), n = Math.round((fin - ini) / t.ds), F = 22; // F: fondo del edificio (m)
    if (!this.mat.intBlanco) {
      this.mat.intBlanco = new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.65, emissive: '#2e2e2c', side: THREE.DoubleSide });
      const vidrio = (pisos) => { const x = Texturas.cristalBoxes().clone(); x.needsUpdate = true; x.repeat.set(1, pisos); return new THREE.MeshStandardMaterial({ map: x, roughness: 0.15, metalness: 0.45, emissive: '#16283a', side: THREE.DoubleSide }); };
      this.mat.intCristal = vidrio(2); this.mat.intCristalAlto = vidrio(5); // (un piso de ~4 m por repetición)
      this.mat.intVisera = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.7, emissive: '#77777a', side: THREE.DoubleSide }); // (por debajo, a la sombra, salía marrón)
    }
    const blanco = this._lote('intBlanco', this.mat.intBlanco), cristal = this._lote('intCristal', this.mat.intCristal);
    const pub = this._lote('publico', this.mat.publico), Ld = (d) => () => lado * d;
    // Bloque alto de cristal al final (últimos 45 m): se dibuja aparte, así que la grada acaba antes
    const nT = Math.min(Math.round(45 / t.ds), Math.floor(n / 4)), nG = n - nT, iT = i0 + nG;
    const yG = 15.8 + (F - 1.5) * 0.48; // altura de la última fila de la grada
    // Planta baja (0-7 m): pared de los garajes (detrás de los carteles de cada equipo) y suelo
    this._pared(blanco, i0, n, Ld(g0 + 0.1), 0, 7, 10, 2);
    this._cinta(this._lote('hormigon', this.mat.hormigon), i0, n, (i) => [lado * g0, lado * (g0 + F)], 0.01, 10, 2);
    // Pisos 1 y 2 (7-15 m): forjados blancos que vuelan 2 m y cristal entre medias (4 m por piso)
    for (const y of [7, 11, 15]) {
      this._cinta(blanco, i0, nG, (i) => [lado * (g0 - 2), lado * (g0 + F)], y, 10, 2);
      this._pared(blanco, i0, nG, Ld(g0 - 2), y - 0.45, y + 0.25, 10, 2);
    }
    this._pared(cristal, i0, nG, Ld(g0 - 1.2), 7.25, 14.55, 8, 2);
    // Grada en la azotea: pretil, gradas con público, fondo del edificio y visera blanca sobre pilares
    this._pared(blanco, i0, nG, Ld(g0 - 1.8), 15, 16.3, 10, 2);
    this._cinta(pub, i0, nG, (i) => [lado * (g0 + 0.5), lado * (g0 + F - 1)], [15.8, yG], 30, 2);
    this._pared(blanco, i0, n, Ld(g0 + F), 0, yG + 1, 10, 2);
    this._cinta(this._lote('intVisera', this.mat.intVisera), i0, nG, (i) => [lado * (g0 - 3), lado * (g0 + F + 0.5)], [29.5, 27.8], 10, 2); // visera
    this._pared(blanco, i0, nG, Ld(g0 - 3), 29.1, 29.7, 10, 2);
    for (let j = 0; j <= nG; j += 8) {
      const i = i0 + j, p = this._p(i, lado * (g0 + F - 0.4));
      this._caja(blanco, p[0], p[1] + 22, p[2], 0.5, 14, 0.5, this._angulo(i));
    }
    // Bloque de cristal del final (7-26 m), cerrado por arriba y por detrás
    this._pared(this._lote('intCristalAlto', this.mat.intCristalAlto), iT, nT, Ld(g0 - 1.2), 7, 26, 8, 2);
    this._pared(blanco, iT, nT, Ld(g0 + F), yG, 26, 10, 2);
    this._cinta(blanco, iT, nT, (i) => [lado * (g0 - 1.5), lado * (g0 + F)], 26, 10, 2);
    this._pared(blanco, iT, nT, Ld(g0 - 1.5), 25.4, 26.6, 10, 2);
    // Testeros (paredes de las puntas) y la que separa la grada del bloque alto
    const testero = (i, alto) => { const p = this._p(i, lado * (g0 + (F - 2) / 2)); this._caja(blanco, p[0], p[1] + alto / 2, p[2], F + 2, alto, 0.4, this._angulo(i)); };
    testero(iT, 29.6); testero(i0 + n, 26.6);
    // La punta que se ve al llegar por la recta: cristal sobre un zócalo blanco (antes una pared lisa enorme)
    { const p = this._p(i0, lado * (g0 + (F - 2) / 2)), ang = this._angulo(i0);
      this._caja(blanco, p[0], p[1] + 3.5, p[2], F + 2, 7, 0.4, ang);
      this._caja(this._lote('intCristalAlto', this.mat.intCristalAlto), p[0], p[1] + 18.3, p[2], F + 2, 22.6, 0.4, ang); }
  }

  // ---------- Túnel del pit lane (circuitos.js → boxesTunel: { sIni, sFin, alto }) ----------
  // Interlagos: la salida de boxes pasa por DEBAJO de la S de Senna. Aquí el pit lane va siempre por su lado,
  // así que se tapa ese trozo con una galería: paredes de hormigón, techo oscuro por dentro y césped por
  // encima (desde el helicóptero se ve como un talud verde y los coches desaparecen dentro, como en la tele)
  _tunelBoxes(tb) {
    const t = this.t, b = t.boxes, lado = b.lado, alto = tb.alto ?? 5;
    const i0 = t.indice(tb.sIni), n = Math.round(Utils.envolver(tb.sFin - tb.sIni, t.L) / t.ds);
    const uDe = (j) => Utils.envolver((i0 + j) * t.ds - b.entrada, t.L); // metros desde la entrada del pit lane
    const c = (j) => Math.abs(t.lateralPitLane(uDe(j)));
    if (!this.mat.cespedTunel) {
      this.mat.cespedTunel = new THREE.MeshStandardMaterial({ color: t.datos.cesped || '#5a8f3a', roughness: 1, side: THREE.DoubleSide });
    }
    const hormigon = this._lote('hormigon', this.mat.hormigon), oscuro = this._lote('oscuro', this.mat.oscuro);
    // (16-11) La pared de dentro iba a c − 7 m, y donde el carril se arrima a la pista (Curva do Sol: c ≈ 10,7 m, borde a
    // 6,3) quedaba ENCIMA del asfalto: una pared gris de 5 m cruzando la pista que los coches atravesaban. Ahora nunca
    // pasa de 1,5 m fuera del borde de la pista (y deja siempre 2,2 m al coche del carril)
    const dentro = (j) => Math.min(c(j) - 2.2, Math.max(c(j) - 7, t.hwEn((i0 + j) * t.ds) + 1.5));
    this._solido(hormigon, i0, n, (i, j) => lado * dentro(j), 0, alto + 0.6, 0.5, 10, 2); // (16-11: paredes con grosor)
    this._solido(hormigon, i0, n, (i, j) => lado * (c(j) + 7), 0, alto + 0.6, 0.5, 10, 2);
    this._cinta(oscuro, i0, n, (i, j) => [lado * dentro(j), lado * (c(j) + 7)], alto, 10, 2);       // techo, por dentro
    this._cinta(this._lote('cespedTunel', this.mat.cespedTunel), i0, n, (i, j) => [lado * (dentro(j) - 0.5), lado * (c(j) + 9)], alto + 0.6, 10, 2); // césped encima
    // Boca del túnel en las dos puntas: dintel de hormigón con una franja oscura
    for (const j of [0, n]) {
      const i = i0 + j, p = this._p(i, lado * c(j)), ang = this._angulo(i);
      this._caja(hormigon, p[0], p[1] + alto + 0.3, p[2], 15, 1.2, 1.2, ang); // (boca: en las dos puntas el carril va lejos de la pista)
    }
  }

  // ---------- El Wing de Silverstone (circuitos.js → edificioBoxes: 'wing') ----------
  // Encima de los garajes: dos plantas blancas con una franja de cristal verdoso y, debajo, una franja amarilla
  // de publicidad; arriba, una banda oscura con SILVERSTONE en letras blancas grandes y el tejado blanco que vuela
  // hacia la pista como el ala de un avión, acabado en punta a los dos lados (vídeo: s 3 y s 88)
  _wing(ini, fin, g0, lado) {
    const t = this.t, i0 = t.indice(ini), n = Math.round((fin - ini) / t.ds);
    if (!this.mat.wingBlanco) {
      this.mat.wingBlanco = new THREE.MeshStandardMaterial({ color: '#f1f2f0', roughness: 0.55, side: THREE.DoubleSide });
      this.mat.wingCristal = new THREE.MeshStandardMaterial({ color: '#8fbfa4', roughness: 0.2, metalness: 0.35, emissive: '#1f3d2e', side: THREE.DoubleSide });
      const tex = Texturas.publicidadMarca({ texto: 'SILVERSTONE', fondo: '#2b3440', color: '#ffffff' }, 'wingRotulo').clone();
      tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
      this.mat.wingRotulo = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
      const amarillo = (this.vis.publicidad || [])[0];
      this.mat.wingFranja = amarillo ? this.matPublicidad[0] : this.mat.naranja;
    }
    const blanco = this._lote('wingBlanco', this.mat.wingBlanco), cristal = this._lote('wingCristal', this.mat.wingCristal);
    const L = (d) => () => lado * d; // lateral fijo a d m del centro de la pista
    // Plantas 1 y 2 (de 7 a 15 m): fachada de cristal un poco adelantada, con franja amarilla debajo
    this._pared(this._lote('wingFranja', this.mat.wingFranja), i0, n, L(g0 - 0.3), 7, 8.3, 20, 2);
    this._pared(cristal, i0, n, L(g0 - 0.5), 8.3, 14.5, 10, 2);
    this._pared(blanco, i0, n, L(g0 - 0.5), 14.5, 15.5, 10, 2);
    this._cinta(blanco, i0, n, (i) => [lado * (g0 - 0.5), lado * (g0 + 24)], 8.3, 10, 2); // suelo del voladizo
    this._pared(blanco, i0, n, L(g0 + 24), 7, 16, 10, 2); // pared de atrás
    // Banda del rótulo (de 15,5 a 21 m), un poco retrasada
    const rot = this._lote('wingRotulo', this.mat.wingRotulo);
    this._pared(rot, i0, n, L(g0 + 1.5), 15.5, 21, 36, 2); // (un SILVERSTONE cada ~36 m)
    this._pared(blanco, i0, n, L(g0 + 24), 15.5, 21, 10, 2);
    // Tejado: losa blanca que vuela 9 m hacia la pista, con canto fino
    this._cinta(blanco, i0, n, (i) => [lado * (g0 - 9), lado * (g0 + 25)], 21.6, 10, 2);
    this._cinta(blanco, i0, n, (i) => [lado * (g0 - 9), lado * (g0 + 25)], 21, 10, 2);
    this._pared(blanco, i0, n, L(g0 - 9), 21, 21.6, 10, 2);
    // Puntas a los dos lados: cuña blanca que baja desde el tejado (perfil triangular, de lado)
    for (const [s, sentido] of [[ini, -1], [fin, 1]]) {
      const i = t.indice(s), p = this._p(i, lado * (g0 + 8));
      const forma = new THREE.Shape([new THREE.Vector2(0, 7), new THREE.Vector2(0, 21.6), new THREE.Vector2(26, 12)]);
      const geo = new THREE.ExtrudeGeometry(forma, { depth: 32, bevelEnabled: false });
      geo.translate(0, 0, -16);
      const m = new THREE.Mesh(geo, this.mat.wingBlanco);
      // (x local = a lo largo de la pista hacia fuera del edificio; z local = hacia la pista y hacia fuera)
      m.position.set(p[0], p[1], p[2]);
      m.rotation.y = Math.atan2(-sentido * t.tz[i], sentido * t.tx[i]);
      m.castShadow = true; m.receiveShadow = true;
      this.grupo.add(m);
    }
    // Pantalla gigante en la fachada, cerca del principio (vídeo s 3: a la derecha, sobre el muro)
    const ip = t.indice(ini + (fin - ini) * 0.7), pp = this._p(ip, lado * (g0 - 2));
    this._caja(this._lote('oscuro', this.mat.oscuro), pp[0], pp[1] + 11, pp[2], 0.6, 6, 9, this._angulo(ip));
  }

  // ---------- Línea de meta, parrilla y semáforo ----------
  _salida() {
    const t = this.t, ds = t.ds, H = (i) => t.hwArr[((i % t.N) + t.N) % t.N];
    this._cinta(this._lote('cuadros', this.mat.cuadros), 0, 1, (i) => [H(i), -H(i)], 0.03, 1.2);

    // Marcas de la parrilla
    const blanco = this._lote('blanco', this.mat.blanco);
    for (let p = 0; p < EQUIPOS.length * 2; p++) {
      const s = -(10 + p * CONFIG.carrera.separacionParrilla) + 3.2;
      const lat = (p % 2 === 0 ? 1 : -1) * CONFIG.carrera.lateralParrilla;
      const i = t.indice(s);
      this._cinta(blanco, i, 1, () => [lat + 1.3, lat - 1.3], 0.03, 1);
      this._cinta(blanco, i - 3, 3, () => [lat + 1.3, lat + 1.0], 0.03, 1);
      this._cinta(blanco, i - 3, 3, () => [lat - 1.0, lat - 1.3], 0.03, 1);
    }

    // Pórtico con el semáforo
    const i = t.indice(-2), ang = this._angulo(i);
    const gris = this._lote('oscuro', this.mat.oscuro);
    for (const lado of [1, -1]) {
      const p = this._p(i, lado * (H(i) + 2.5));
      this._caja(gris, p[0], p[1] + 4, p[2], 0.7, 8, 0.7, ang);
    }
    const c = this._p(i, 0);
    this._caja(gris, c[0], c[1] + 7.8, c[2], 0.6, 0.6, 0.6, ang); // (anclaje)
    const viga = new THREE.Mesh(new THREE.BoxGeometry(H(i) * 2 + 5.5, 0.7, 0.7), this.mat.oscuro);
    viga.position.set(c[0], c[1] + 7.8, c[2]);
    viga.rotation.y = ang;
    viga.castShadow = true;
    this.grupo.add(viga);
    // Panel de luces: 5 columnas con 2 luces cada una, mirando a la parrilla
    const panel = new THREE.Group();
    panel.position.set(c[0], c[1] + 6.6, c[2]);
    panel.rotation.y = ang + Math.PI;
    const fondo = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 0.3), this.mat.oscuro);
    panel.add(fondo);
    const geoLuz = new THREE.CircleGeometry(0.2, 16);
    for (let col = 0; col < 5; col++) {
      const m = new THREE.MeshStandardMaterial({ color: '#2a0505', emissive: '#000000', roughness: 0.3 });
      this.lucesSalida.push(m);
      for (let fila = 0; fila < 2; fila++) {
        const luz = new THREE.Mesh(geoLuz, m);
        luz.position.set(-1.7 + col * 0.85, 0.3 - fila * 0.6, 0.16);
        panel.add(luz);
      }
    }
    this.grupo.add(panel);
  }

  // Enciende n luces rojas del semáforo (0 = apagado)
  semaforo(n) {
    this.lucesSalida.forEach((m, i) => {
      const on = i < n;
      m.color.set(on ? '#ff2020' : '#2a0505');
      m.emissive.set(on ? '#ff0000' : '#000000');
      m.emissiveIntensity = on ? 3 : 0;
    });
  }

  // ---------- Tribunas ----------
  _tribunas() {
    const t = this.t, lado = -t.boxes.lado, ds = t.ds;
    const pub = this._lote('publico', this.mat.publico);
    const gris = this._lote('gris', this.mat.gris);
    if (!this.mat.techoGrada) this.mat.techoGrada = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.6, side: THREE.DoubleSide }); // (16-11: se ve por los dos lados)
    const techo = this._lote('techoGrada', this.mat.techoGrada);
    const construir = (sIni, longitud, ld, F = 18) => { // F = fondo de la grada (m)
      const i0 = t.indice(sIni), n = Math.round(longitud / ds);
      const muro = ld > 0 ? t.muroIzq : t.muroDer;
      // (15-11) Del lado de los boxes, la grada va DETRÁS del pit lane (antes se ponía a 4 m del muro de la pista y el
      // carril de boxes de Mónaco la atravesaba en La Rascasse)
      const d = (i) => muro[i] + 4 + (ld === t.boxes.lado ? this._detrasPit(i) : 0);
      // (ni en el lado del agua del puerto: ahí, en el vídeo, solo hay guardarraíl y los yates)
      const sI = Utils.envolver(sIni, t.L); // (¿se solapa [sI, sI + longitud] con el tramo de agua?)
      if (t.zonasAgua.some((P) => ld === P.lado && sI < P.sFin && sI + longitud > P.sIni)) return;
      // (ni donde van fachadas de edificios pegadas a la calle: circuitos.js → fachadas)
      if (this._enZona(t.datos.fachadas, i0, ld) || this._enZona(t.datos.fachadas, (i0 + n) % t.N, ld)) return;
      // ¿Hay sitio? (no pisar otra parte del circuito)
      for (let j = 0; j <= n; j += 10) {
        const i = (i0 + j) % t.N, p = this._p(i, ld * (d(i) + F));
        if (t.distanciaPista(p[0], p[2], i) < t.hw + 7 + F) return;
        // (y que ningún trozo de la grada, de delante a atrás, pise un tramo cercano de la MISMA zona: en una chicane
        //  la pista vuelve a pasar a pocos metros y distanciaPista no lo ve, porque se salta ±220 m. Bus Stop de Spa)
        for (const f of [0, 0.5, 1]) {
          const q = this._p(i, ld * (d(i) + F * f));
          for (let k = 0; k < t.N; k += 2) {
            const e = Math.abs(k - i), sep = Math.min(e, t.N - e) * t.ds;
            if (sep > 25 && sep < 260 && Math.hypot(t.x[k] - q[0], t.z[k] - q[2]) < t.hw + 3) return;
          }
        }
      }
      this._cinta(pub, i0, n, (i) => [ld * d(i), ld * (d(i) + F)], [1.5, 1.5 + F * 0.58], 30, 3);
      this._pared(gris, i0, n, (i) => ld * d(i), 0, 1.5, 10, 3);
      this._pared(gris, i0, n, (i) => ld * (d(i) + F), 0, 1.5 + F * 0.58, 10, 3);
      // (16-11) Techo con grosor (40 cm) y visible también desde abajo (antes una lámina que, vista desde la pista, ni se veía)
      this._cinta(techo, i0, n, (i) => [ld * (d(i) - 1), ld * (d(i) + F + 1)], 3.5 + F * 0.67, 10, 3); // techo
      this._cinta(techo, i0, n, (i) => [ld * (d(i) - 1), ld * (d(i) + F + 1)], 3.1 + F * 0.67, 10, 3);
      this._pared(techo, i0, n, (i) => ld * (d(i) - 1), 3.1 + F * 0.67, 3.5 + F * 0.67, 10, 3);
      // (16-11) Paredes de los LADOS: antes la grada quedaba abierta por las puntas y, de lado, se veía como una lámina.
      // Van en escalera siguiendo las gradas (5 tramos), de hormigón claro, y un pilar hasta el techo en la esquina de atrás
      // (antes era un panel negro entero hasta el techo que parecía un cartel)
      const horm = this._lote('hormigon', this.mat.hormigon), hT = 3.5 + F * 0.67;
      for (const j of [0, n]) {
        const i = (((i0 + j) % t.N) + t.N) % t.N, ang = this._angulo(i);
        for (let k = 0; k < 5; k++) {
          const f0 = k / 5, f1 = (k + 1) / 5, alto = 1.5 + F * 0.58 * f1, p = this._p(i, ld * (d(i) + F * (f0 + f1) / 2));
          this._caja(horm, p[0], p[1] + alto / 2, p[2], F / 5 + 0.05, alto, 0.4, ang);
        }
        const pa = this._p(i, ld * (d(i) + F - 0.3));
        this._caja(horm, pa[0], pa[1] + hT / 2, pa[2], 0.6, hT, 0.6, ang);
      }
      for (let j = 0; j <= n; j += 15) {
        const i = (i0 + j) % t.N, p = this._p(i, ld * (d(i) + F - 0.5));
        this._caja(gris, p[0], p[1] + (3.5 + F * 0.67) / 2, p[2], 0.4, 3.5 + F * 0.67, 0.4, this._angulo(i));
      }
      for (let j = 0; j <= n; j += 8) {
        const i = (i0 + j) % t.N, p = this._p(i, ld * (d(i) + F / 2));
        this.ocupado.push([p[0], p[2], F - 1]);
      }
    };
    // Tribunas extra a la salida de las curvas de visual.tribunasSalida (por fuera)
    for (const nombre of this.vis.tribunasSalida || []) {
      const c = t.curvas.find((x) => x.nombre === nombre);
      if (c) construir(c.sFin - 210, 200, (c.giro ?? t.valor(t.kBruta, (c.sIni + c.sFin) / 2)) > 0 ? 1 : -1);
    }
    // Tribunas puestas a mano por metros (circuitos.js → tribunas: [{ sIni, sFin, lado }]; Mónaco: Piscine, Rascasse...)
    for (const z of t.datos.tribunas || []) construir(z.sIni, z.sFin - z.sIni, z.lado, z.fondo ?? 18);
    // Recta principal (enfrente de los boxes), salvo circuitos.js → tribunaRecta: false (Spa: ahí hay césped y muro,
    // y la grada quedaba entre la recta y la bajada de La Source: se veía su pared gris de espaldas)
    if (t.datos.tribunaRecta !== false) construir(-t.rectaPrincipal.longitudFinal + 120, t.rectaPrincipal.longitudFinal + 80, lado, t.datos.fondoTribunaRecta ?? 18); // (fondoTribunaRecta: grada principal más grande, Catalunya)
    // Las 3 frenadas más fuertes: tribuna por fuera de la curva
    const frenadas = t.curvas
      .map((c) => ({ c, caida: t.valor(t.vRef, c.sIni - 150) - t.valor(t.vRef, (c.sIni + c.sFin) / 2) }))
      .sort((a, b) => b.caida - a.caida)
      .slice(0, 3);
    if (t.datos.tribunasFrenadas !== false) for (const { c } of frenadas) { // (Interlagos: false, van puestas a mano según el vídeo)
      const k = t.valor(t.kBruta, (c.sIni + c.sFin) / 2);
      construir(c.sIni - 160, 200, k > 0 ? 1 : -1);
    }
    this.frenadasPrincipales = frenadas.map((f) => f.c);
  }

  // ---------- Puentes publicitarios sobre la pista ----------
  _puentes() {
    const t = this.t, H = (i) => t.hwArr[((i % t.N) + t.N) % t.N]; // media anchura en la muestra i
    // Por defecto, uno en cada recta larga. O puestos a mano (circuitos.js → puentes: [{ s, marca, alto }]):
    // Silverstone: el amarillo de la recta de meta y el azul de Wellington
    const manual = t.datos.puentes;
    const posiciones = manual ? manual.map((p) => p.s) : t.rectasLargas.map((z) => z.inicio + Utils.envolver(z.fin - z.inicio, t.L) * 0.55);
    posiciones.forEach((s, k) => {
      if (!manual && k === 0 && Math.abs(Utils.envolver(s + 200, t.L) - 200) < 150) return; // demasiado cerca del pórtico
      const i = t.indice(s), ang = this._angulo(i);
      const gris = this._lote('gris', this.mat.gris);
      // (circuitos.js → puentes: [{ ..., hormigon: true, fondo: m }]: paso bajo una estructura de hormigón ancha, como la
      //  vieja peraltada de Monza en el Serraglio: losa gruesa de 'fondo' m a lo largo de la pista, estribos macizos a los
      //  lados y el cartel pegado a las dos caras. Solo si la ficha lo pide)
      if (manual?.[k].hormigon) {
        const P = manual[k], F = P.fondo ?? 14, c0 = this._p(i, 0), horm = this._lote('hormigon', this.mat.hormigon);
        const ancho = H(i) * 2 + 60; // (la peraltada sigue a los dos lados, entre los árboles)
        this._caja(horm, c0[0], c0[1] + 7.4, c0[2], ancho, 3.2, F, ang); // losa (gálibo de ~5,8 m, como el real)
        for (const lado of [1, -1]) { // estribos
          const p = this._p(i, lado * (H(i) + 7));
          this._caja(horm, p[0], p[1] + 3, p[2], 4, 6, F, ang);
        }
        const mat = this.matPublicidad[(P.marca ?? 0) % this.matPublicidad.length];
        for (const sentido of [-1, 1]) { // cartel en las dos caras
          const cartel = new THREE.Mesh(new THREE.BoxGeometry(H(i) * 2 + 8, P.alto ?? 2.4, 0.3), mat);
          cartel.position.set(c0[0] + t.tx[i] * sentido * (F / 2 + 0.2), c0[1] + 7.4, c0[2] + t.tz[i] * sentido * (F / 2 + 0.2));
          cartel.rotation.y = ang;
          this.grupo.add(cartel);
        }
        return;
      }
      for (const lado of [1, -1]) {
        const p = this._p(i, lado * (H(i) + 5));
        this._caja(gris, p[0], p[1] + 4, p[2], 1.2, 8, 1.2, ang);
      }
      const c = this._p(i, 0);
      const marca = manual ? manual[k].marca ?? 0 : (k * 3 + 1);
      const puente = new THREE.Mesh(new THREE.BoxGeometry(H(i) * 2 + 12, manual?.[k].alto ?? 1.8, 2.2), this.matPublicidad[marca % this.matPublicidad.length]);
      puente.position.set(c[0], c[1] + 8.6, c[2]);
      puente.rotation.y = ang;
      puente.castShadow = true;
      this.grupo.add(puente);
    });
  }

  // ---------- Detalles: casetas de comisarios y carteles de frenada ----------
  _detalles() {
    const t = this.t, H = (i) => t.hwArr[((i % t.N) + t.N) % t.N];
    const nar = this._lote('naranja', this.mat.naranja);
    for (let s = 150; s < t.L - 100; s += 380) {
      const i = t.indice(s), lado = t.kLarga[i] > 0 ? -1 : 1; // por dentro
      if (lado === t.boxes.lado && this._enBoxes(i, 80)) continue;
      const muro = lado > 0 ? t.muroIzq[i] : t.muroDer[i];
      const p = this._p(i, lado * (muro + 2.5));
      if (t.conAltura && Math.abs(t.sueloXZ(p[0], p[2]) + 0.9 - p[1]) > 1) continue; // (en cuesta: ahí el suelo es de otro tramo, flotaría o quedaría enterrada)
      this._caja(nar, p[0], p[1] + 1.2, p[2], 2.2, 2.4, 2.2, this._angulo(i));
    }
    // Carteles 300 / 200 / 100 antes de las frenadas más fuertes
    for (const c of this.frenadasPrincipales || []) {
      (t.datos.cartelesFrenada || [300, 200, 100]).forEach((d) => { // (Mónaco: 100 y 50, como en el vídeo)
        const i = t.indice(c.sIni - d - 40);
        const lado = t.valor(t.kBruta, c.sIni + 5) > 0 ? 1 : -1; // en el exterior
        const p = this._p(i, lado * (H(i) + 4));
        // (16-11) Placa con grosor sobre un poste (antes un plano flotando en el aire)
        this._caja(this._lote('gris', this.mat.gris), p[0], p[1] + 0.5, p[2], 0.1, 1.0, 0.1, this._angulo(i));
        const cartel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.08), new THREE.MeshStandardMaterial({ map: Texturas.cartelDistancia(d, this.vis.cartelFrenada?.fondo, this.vis.cartelFrenada?.color), side: THREE.DoubleSide }));
        cartel.position.set(p[0], p[1] + 1.6, p[2]);
        cartel.rotation.y = this._angulo(i) + Math.PI;
        this.grupo.add(cartel);
      });
    }
  }

  // ---------- Muros de neumáticos (visual.ambiente): delante de la valla, donde la escapatoria es ancha ----------
  _neumaticos() {
    // (circuitos.js → visual.neumaticos: false: sin muros de neumáticos. Spa: delante de las vallas hay guardarraíl
    //  de metal, no neumáticos; con ellos, todo el borde salía como una franja negra)
    if (this.vis.neumaticos === false) return;
    const t = this.t, H = (i) => t.hwArr[((i % t.N) + t.N) % t.N];
    if (!this.mat.neumaticos) this.mat.neumaticos = new THREE.MeshStandardMaterial({ map: Texturas.neumaticos(), roughness: 0.95 });
    const frente = this._lote('neumaticos', this.mat.neumaticos), arriba = this._lote('oscuro', this.mat.oscuro);
    const ALTO = 0.95, FONDO = 0.8; // (4 neumáticos apilados)
    for (const lado of [1, -1]) {
      const muro = lado > 0 ? t.muroIzq : t.muroDer;
      const tu = t.datos.tunel, enTunel = (i) => tu && Utils.envolver(i * t.ds - tu.sIni, t.L) < Utils.envolver(tu.sFin - tu.sIni, t.L);
      const ancha = (i) => muro[i] - H(i) > 9 && !(lado === t.boxes.lado && this._enBoxes(i, 30)) && !enTunel(i) && !this._enZona(t.datos.murosAltos, i, lado);
      for (const [i0, n] of this._tramos(ancha)) {
        if (n * t.ds < 25) continue; // (trozos sueltos no: parecerían un fallo)
        this._pared(frente, i0, n, (i) => lado * (muro[i] - FONDO), 0, ALTO, 4, 2);
        this._cinta(arriba, i0, n, (i) => [lado * (muro[i] - FONDO), lado * (muro[i] - 0.05)], ALTO, 10, 2);
      }
    }
  }

  // ---------- Franjas verdes y logo pintados en las escapatorias de asfalto (visual.ambiente) ----------
  _franjasYLogos() {
    const t = this.t, N = t.N, H = (i) => t.hwArr[((i % N) + N) % N];
    if (!this.mat.franjaVerde) { this.mat.franjaVerde = new THREE.MeshStandardMaterial({ color: '#2f8f55', roughness: 0.85 }); this._capa(this.mat.franjaVerde, 0); }
    const verde = this._lote('franjaVerde', this.mat.franjaVerde);
    const anchoAsfalto = (i, lado) => { // metros de asfalto de escapatoria fuera del piano
      const g = lado > 0 ? t.gravaIzq : t.gravaDer, muro = lado > 0 ? t.muroIzq : t.muroDer;
      return Math.min(H(i) + 7.5 + (this.zonaEscAsfalto[i] ? g[i] : 0), muro[i] - 0.5) - H(i);
    };
    for (const lado of [1, -1]) {
      for (const [i0, n] of this._tramos((i) => this.zonaEscAsfalto[i] && anchoAsfalto(i, lado) > 8)) {
        this._cinta(verde, i0, n, (i) => [lado * (H(i) + 2.6), lado * (H(i) + 4.2)], 0.014, 10, 2); // franja junto al piano
      }
    }
    // Logo BOX BOX tumbado en el asfalto, en la parte más ancha de cada escapatoria de chicane
    if (!this.mat.logoSuelo) { this.mat.logoSuelo = new THREE.MeshStandardMaterial({ map: Texturas.logoSuelo(), transparent: true, roughness: 0.85, depthWrite: false }); this._capa(this.mat.logoSuelo, -1); }
    // (candidatas: las escapatorias de asfalto puestas a mano y las automáticas de las chicanes)
    const sitios = t.escManual.filter((e) => e.tipo !== 'grava').map((e) => {
      let j = 0; for (let k = 1; k <= e.n; k++) if (e.anchos[k] > e.anchos[j]) j = k;
      return { i: (e.i0 + j) % N, lado: e.lado, w: e.anchos[j] - 4.5 };
    });
    for (const nombre of this.vis.chicanes || []) {
      const c = t.curvas.find((x) => x.nombreReal === nombre || x.nombre === nombre);
      if (!c) continue;
      for (let s = c.sIni - 60; s <= c.sFin; s += 4) {
        const i = t.indice(s);
        for (const lado of [1, -1]) if (this.zonaEscAsfalto[i]) sitios.push({ i, lado, w: anchoAsfalto(i, lado) - 4.5 });
      }
    }
    for (const m of sitios) if (m.w > 7 && !sitios.some((o) => o !== m && o.w > m.w && Math.abs(o.i - m.i) * t.ds < 200)) { // (uno por zona: el más ancho)
      const mejor = m;
      const largo = Math.min(22, mejor.w * 3.2), p = this._p(mejor.i, mejor.lado * (H(mejor.i) + 4.5 + mejor.w / 2), 0.03);
      const geo = new THREE.PlaneGeometry(largo, largo / 4);
      geo.rotateX(-Math.PI / 2); // tumbado
      geo.rotateY(this._angulo(mejor.i) + (mejor.lado > 0 ? Math.PI : 0)); // a lo largo de la pista, legible desde ella
      const logo = new THREE.Mesh(geo, this.mat.logoSuelo);
      logo.position.set(p[0], p[1], p[2]);
      logo.receiveShadow = true;
      this.grupo.add(logo);
    }
  }

  // ---------- Carpas blancas en filas (circuitos.js → carpas), a "dist" m del muro y cada "cada" m ----------
  _carpas() {
    const t = this.t;
    for (const z of t.datos.carpas || []) {
      const muro = z.lado > 0 ? t.muroIzq : t.muroDer, blanco = this._lote('techo', this.mat.blanco);
      for (let s = z.sIni, k = 0; s < z.sFin; s += z.cada || 12, k++) {
        for (let fila = 0; fila < (z.filas || 2); fila++) {
          const i = t.indice(s + (fila % 2) * (z.cada || 12) / 2), ang = this._angulo(i);
          const p = this._p(i, z.lado * (muro[i] + (z.dist || 30) + fila * 9));
          if (t.distanciaPista(p[0], p[2], i) < t.hw + 10 || this.ocupado.some(([ox, oz, r]) => Math.hypot(ox - p[0], oz - p[2]) < r)) continue;
          const tam = 3 + (k % 3); // (unas más grandes que otras)
          const carpa = new THREE.ConeGeometry(tam, 1.6 + tam * 0.25, 4); carpa.rotateY(Math.PI / 4 + ang); carpa.translate(p[0], p[1] + 3 + (1.6 + tam * 0.25) / 2, p[2]);
          const m = new THREE.Mesh(carpa, this.mat.blanco); m.castShadow = true; this.grupo.add(m);
          this._caja(blanco, p[0], p[1] + 1.5, p[2], tam * 1.3, 3, tam * 1.3, ang); // (los lados de lona)
          this.ocupado.push([p[0], p[2], tam + 3]);
        }
      }
    }
  }

  // ---------- Paddock detrás del edificio de boxes (visual.ambiente): camiones, contenedores y carpas ----------
  _paddock() {
    const t = this.t, b = t.boxes, lado = b.lado, eb = this._edificioBoxes;
    if (!eb) return;
    const g0 = Math.abs(b.lateralGaraje), colores = ['#c0392b', '#2471a3', '#d4ac0d', '#7d3c98', '#17a589', '#e67e22', '#5d6d7e', '#f4f6f7'];
    const mat = (c) => this.mat['paddock' + c] || (this.mat['paddock' + c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 }));
    // (16-11) Nada del paddock encima de otro tramo de la pista (Interlagos: la pista del infield pasa por debajo)
    const libre = (p, i, r) => t.distanciaPista(p[0], p[2], i) > t.hw + r;
    for (let s = eb.ini + 6, k = 0; s < eb.fin - 6; s += 9, k++) {
      const i = t.indice(s), ang = this._angulo(i);
      if (![27, 34, 41].every((d) => libre(this._p(i, lado * (g0 + d)), (i % t.N + t.N) % t.N, 8))) continue;
      // Camión del equipo (con su color) y, detrás, contenedores de colores (alguno apilado)
      const pc = this._p(i, lado * (g0 + 27)), col = EQUIPOS[k % EQUIPOS.length].colores.principal;
      this._caja(this._lote('paddock' + col, mat(col)), pc[0], pc[1] + 2, pc[2], 2.6, 4, 7, ang);
      for (let a = 0; a < 1 + (k % 2); a++) {
        const c2 = colores[(k * 3 + a) % colores.length], pk = this._p(i, lado * (g0 + 34));
        this._caja(this._lote('paddock' + c2, mat(c2)), pk[0], pk[1] + 1.3 + a * 2.6, pk[2], 2.4, 2.5, 6, ang);
      }
      // Carpa blanca cada tres (tejado en pirámide sobre cuatro patas finas)
      if (k % 3 === 0) {
        const pt = this._p(i, lado * (g0 + 41)), blanco = this._lote('techo', this.mat.blanco);
        const carpa = new THREE.ConeGeometry(3.6, 2, 4); carpa.rotateY(Math.PI / 4 + ang); carpa.translate(pt[0], pt[1] + 4, pt[2]);
        const m = new THREE.Mesh(carpa, this.mat.blanco); m.castShadow = true; this.grupo.add(m);
        const c = Math.cos(ang), sn = Math.sin(ang);
        for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
          this._caja(blanco, pt[0] + dx * c + dz * sn, pt[1] + 1.5, pt[2] - dx * sn + dz * c, 0.1, 3, 0.1, ang);
        }
      }
      const po = this._p(i, lado * (g0 + 34));
      this.ocupado.push([po[0], po[2], 12]); // (sin árboles encima)
    }
  }

  // ---------- Túnel (opcional: datos.tunel = { sIni, sFin, alto }, como el de Mónaco) ----------
  // Paredes de hormigón a los dos lados, techo (visto desde dentro y desde fuera) y una fila de luces
  _tunel() {
    const tu = this.t.datos.tunel;
    if (!tu) return;
    const t = this.t, i0 = t.indice(tu.sIni), n = Math.round(Utils.envolver(tu.sFin - tu.sIni, t.L) / t.ds);
    const alto = tu.alto ?? 7, W = (i) => Math.max(t.muroIzq[i], t.muroDer[i]) + 0.6; // por fuera de la valla
    // Como en el vídeo (53-58 s): luz de sodio ANARANJADA, pared clara que la refleja, dos filas de luces
    // en el techo y, a la izquierda, columnas delante de la pared (el lado del mar)
    if (!this.mat.tunel) {
      // (emissive alto: dentro no llega el sol; es la luz de sodio la que las ilumina)
      this.mat.tunel = new THREE.MeshStandardMaterial({ color: '#e0c09a', emissive: '#74441a', roughness: 0.85, side: THREE.DoubleSide });
      this.mat.techoTunel = new THREE.MeshStandardMaterial({ color: '#3a3430', emissive: '#2a1a08', roughness: 1, side: THREE.DoubleSide });
      this.mat.luzTunel = new THREE.MeshBasicMaterial({ color: '#fff0d0', side: THREE.DoubleSide });
    }
    // (circuitos.js → tunel.oscuro: 0…1. Túnel en penumbra como en la tele: pared casi negra que el sol no aclara,
    //  con reflejos naranjas en franjas, asfalto oscurecido y losa de hormigón gris por fuera. Sin él, como antes)
    if (tu.oscuro && !this.mat.tunelOscuro) {
      this.mat.tunelOscuro = new THREE.MeshStandardMaterial({ color: '#1e1b18', emissive: '#ffffff', emissiveMap: Texturas.paredTunel(), roughness: 0.6, side: THREE.DoubleSide });
      this.mat.sombraTunel = new THREE.MeshBasicMaterial({ color: '#0a0806', transparent: true, opacity: tu.oscuro, depthWrite: false });
      this._capa(this.mat.sombraTunel, -4);
    }
    const pared = tu.oscuro ? this._lote('tunelOscuro', this.mat.tunelOscuro) : this._lote('tunel', this.mat.tunel), techo = this._lote('techoTunel', this.mat.techoTunel);
    for (const lado of [1, -1]) this._solido(pared, i0, n, (i) => lado * W(i), 0, alto + 0.2, 0.6, 10, 2); // (16-11: con grosor)
    this._cinta(techo, i0, n, (i) => [W(i), -W(i)], alto, 10, 2);        // techo (oscuro)
    this._cinta(tu.oscuro ? this._lote('hormigon', this.mat.hormigon) : pared, i0, n, (i) => [W(i) + 2, -W(i) - 2], alto + 2, 10, 2); // losa de encima (el hotel)
    if (tu.oscuro) { // penumbra sobre el asfalto (sin los 25 m de cada boca: ahí aún entra luz)
      const m = Math.round(25 / t.ds);
      if (n > 2 * m) this._cinta(this._lote('sombraTunel', this.mat.sombraTunel), i0 + m, n - 2 * m, (i) => [W(i), -W(i)], 0.045, 10, 2);
    }
    // Guardarraíl gris a los dos lados (dentro no hay muros con publicidad: ver _muros)
    const gris = this._lote('gris', this.mat.gris);
    for (const lado of [1, -1]) this._pared(gris, i0, n, (i) => lado * ((lado > 0 ? t.muroIzq : t.muroDer)[(i % t.N + t.N) % t.N]), 0.3, 0.9, 10, 2);
    // Dos filas de lámparas en el techo, una cada ~6 m (en el vídeo se ven como puntos de luz seguidos)
    const luz = this._lote('luzTunel', this.mat.luzTunel);
    for (let j = 0; j < n; j += 3) for (const x of [2.2, -2.2]) {
      const i = i0 + j, p = this._p(i, x);
      this._caja(luz, p[0], p[1] + alto - 0.1, p[2], 0.5, 0.12, 1.4, this._angulo(i));
    }
    for (let j = 0; j < n; j += 5) { // columnas a la izquierda, cada ~10 m
      const i = i0 + j, p = this._p(i, W((i % t.N + t.N) % t.N) - 0.5);
      this._caja(pared, p[0], p[1] + alto / 2, p[2], 0.8, alto, 0.8, this._angulo(i));
    }
  }

  // ¿Está la muestra i (por el lado "lado") dentro de alguna zona { sIni, sFin, lado } de la lista?
  _enZona(lista, i, lado) {
    const t = this.t, s = i * t.ds;
    return !!(lista || []).find((z) => z.lado === lado && Utils.envolver(s - z.sIni, t.L) < Utils.envolver(z.sFin - z.sIni, t.L));
  }

  // Recorre cada zona de una lista de circuitos.js: f(zona, i0, n)
  _porZonas(lista, f) {
    const t = this.t;
    for (const z of lista || []) f(z, t.indice(z.sIni), Math.round(Utils.envolver(z.sFin - z.sIni, t.L) / t.ds));
  }

  // ---------- Barreras de neumáticos con funda de color delante del muro (circuitos.js → barrerasColor) ----------
  // La naranja de Portier: bloques de 2 m de largo, 1,1 m de alto y 0,8 m de fondo pegados al muro
  _barrerasColor() {
    const t = this.t;
    this._porZonas(t.datos.barrerasColor, (z, i0, n) => {
      const clave = 'barrera' + z.color;
      if (!this.mat[clave]) this.mat[clave] = new THREE.MeshStandardMaterial({ color: z.color || '#ff6a00', roughness: 0.75 });
      const lote = this._lote(clave, this.mat[clave]), paso = Math.max(1, Math.round(2.05 / t.ds));
      for (let k = 0; k <= n; k += paso) {
        const i = i0 + k, muro = z.lado > 0 ? t.muroIzq[(i % t.N + t.N) % t.N] : t.muroDer[(i % t.N + t.N) % t.N];
        const p = this._p(i, z.lado * (muro - 0.45));
        this._caja(lote, p[0], p[1] + 0.55, p[2], 0.8, 1.1, 2.0, this._angulo(i));
      }
    });
  }

  // ---------- Grúas de la organización detrás del muro (circuitos.js → gruas: { s, lado, dist, color }) ----------
  // Camión grúa: chasis, cabina, torreta y brazo inclinado con el gancho colgando
  _gruas() {
    const t = this.t;
    for (const g of t.datos.gruas || []) {
      const i = t.indice(g.s), ii = (i % t.N + t.N) % t.N, muro = g.lado > 0 ? t.muroIzq[ii] : t.muroDer[ii];
      // (16-11) El brazo llega 11,2 m hacia la pista: la grúa se aparta lo justo para que el gancho quede 1,5 m por
      // fuera del muro (antes colgaba encima del asfalto en Mónaco)
      const alcance = -1.6 + Math.cos(0.66) * 16;
      const sitio = (di) => this._p(i + di, g.lado * (muro + Math.max(g.dist ?? 6, alcance + 1.5) + (g.lado === t.boxes.lado ? this._detrasPit(ii) : 0))); // (15-11) detrás del pit lane
      // (16-11) Si la grúa queda encima de OTRO tramo de la pista (Mónaco: detrás de Mirabeau Bas, la bajada de
      // Mirabeau pasa por debajo), se corre unos metros a lo largo de la pista hasta un sitio libre
      let p = sitio(0);
      for (const di of [8, -8, 16, -16, 24, -24, 32, -32]) {
        if (t.distanciaPista(p[0], p[2]) > t.hw + 6) break;
        p = sitio(Math.round(di * 2 / t.ds) * 1);
      }
      const color = new THREE.MeshStandardMaterial({ color: g.color || '#c8161d', roughness: 0.55 });
      const oscuro = this.mat.oscuro, gr = new THREE.Group();
      const pieza = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; gr.add(m); return m; };
      pieza(new THREE.BoxGeometry(2.5, 1.2, 7.5), color, 0, 1.3, 0);            // chasis
      pieza(new THREE.BoxGeometry(2.5, 1.6, 2), color, 0, 2.5, 3.1);            // cabina
      pieza(new THREE.BoxGeometry(2.3, 0.5, 1.6), this.mat.cristal || oscuro, 0, 2.8, 4.11); // parabrisas
      for (const z of [-2.6, -1.2, 2.8]) for (const x of [-1.15, 1.15]) {       // ruedas
        const r = pieza(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), oscuro, x, 0.55, z); r.rotation.z = Math.PI / 2;
      }
      pieza(new THREE.CylinderGeometry(0.9, 1, 1.1, 10), color, 0, 2.45, -1.6);  // torreta
      // Brazo de 16 m inclinado 38°, apuntando hacia la pista
      const ang = 0.66, largo = 16;
      pieza(new THREE.BoxGeometry(0.7, 0.7, largo), color, 0, 3 + Math.sin(ang) * largo / 2, -1.6 + Math.cos(ang) * largo / 2, -ang);
      const pyP = 3 + Math.sin(ang) * largo, pzP = -1.6 + Math.cos(ang) * largo;
      pieza(new THREE.CylinderGeometry(0.03, 0.03, 6, 4), oscuro, 0, pyP - 3, pzP); // cable
      pieza(new THREE.BoxGeometry(0.5, 0.6, 0.3), color, 0, pyP - 6.2, pzP);         // gancho
      gr.position.set(p[0], p[1], p[2]);
      gr.rotation.y = Math.atan2(-g.lado * t.nx[ii], -g.lado * t.nz[ii]) + (g.giro || 0); // el brazo (eje z del grupo), hacia la pista
      // (16-11) Si el gancho cae encima de OTRO tramo (Mónaco: detrás de Mirabeau Bas pasa la bajada de Mirabeau), se
      // gira la grúa poco a poco hasta que el gancho quede fuera del asfalto
      const r0 = gr.rotation.y, alcanceZ = -1.6 + Math.cos(0.66) * 16;
      for (const dg of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
        const ry = r0 + dg;
        if (t.distanciaPista(p[0] + Math.sin(ry) * alcanceZ, p[2] + Math.cos(ry) * alcanceZ) > t.hw + 1.5) { gr.rotation.y = ry; break; }
      }
      this.grupo.add(gr);
    }
  }

  // ---------- Muros altos (circuitos.js → murosAltos): Beau Rivage, el muro blanco alto de la derecha ----------
  // En su lugar no hay cartel de publicidad (ver _muros): muro liso de "alto" m y la valla encima
  _murosAltos() {
    const t = this.t;
    this._porZonas(t.datos.murosAltos, (z, i0, n) => {
      const muro = z.lado > 0 ? t.muroIzq : t.muroDer, lat = (i) => z.lado * muro[i];
      if (!this.mat['muroAlto' + z.color]) this.mat['muroAlto' + z.color] = new THREE.MeshStandardMaterial({ color: z.color || '#eeeeea', emissive: '#8a8a86', roughness: 0.9, side: THREE.DoubleSide }); // (blanco aunque le dé la sombra)
      this._solido(this._lote('muroAlto' + z.color, this.mat['muroAlto' + z.color]), i0, n, lat, 0, z.alto, 0.5, 10, 2, this._lote('muroAlto' + z.color, this.mat['muroAlto' + z.color])); // (16-11: con grosor)
      this._pared(this._lote('red', this.mat.red), i0, n, (i) => lat(i) + z.lado * 0.2, z.alto, z.alto + 2.5, 1.5, 2);
    });
  }

  // ---------- Línea pintada en el borde del asfalto (circuitos.js → lineasBorde): la amarilla de Massenet ----------
  _lineasBorde() {
    const t = this.t;
    this._porZonas(t.datos.lineasBorde, (z, i0, n) => {
      const clave = 'linea' + z.color;
      if (!this.mat[clave]) { this.mat[clave] = new THREE.MeshBasicMaterial({ color: z.color }); this._capa(this.mat[clave], -3); }
      this._cinta(this._lote(clave, this.mat[clave]), i0, n, (i) => [z.lado * (t.hwArr[i] - 0.15), z.lado * (t.hwArr[i] - 0.4)], 0.02, 10, 1);
    });
  }

  // ---------- Fachadas de edificios pegadas a la calle (circuitos.js → fachadas) ----------
  // Una fachada con ventanas, persianas y balcones a "dist" m del muro, de "alto" m, y su tejado.
  // Donde chocaría con otro tramo del circuito, no se pone (así no tapa la pista de al lado)
  _fachadas() {
    const t = this.t;
    if (!this.mat.tejado) this.mat.tejado = new THREE.MeshStandardMaterial({ color: '#a9623c', roughness: 0.95, side: THREE.DoubleSide });
    // Puntos del centro del pit lane cada 4 m (para no poner edificios encima)
    this._puntosPit = [];
    if (t.boxes) for (let u = 0; u <= t.boxes.longitud; u += 4) { const p = this._p(t.indice(t.boxes.entrada + u), t.lateralPitLane(u)); this._puntosPit.push([p[0], p[2]]); }
    this._porZonas(t.datos.fachadas, (z, i0, n) => {
      // Tres tonos del color de la zona (más claro, igual, más oscuro): cada edificio coge uno, como en el vídeo
      const tonos = [1.08, 1, 0.9].map((f) => {
        const clave = 'fachada' + z.color + (z.clasica ? 'C' : '') + f;
        // (circuitos.js → visual.brilloFachadas, 0…1: luz rebotada de la calle, para que la piedra clara no salga
        //  marrón en la sombra con el sol alto de mediodía; con el mapa de ventanas, las ventanas siguen oscuras)
        const brillo = this.vis.brilloFachadas || 0;
        if (!this.mat[clave]) this.mat[clave] = new THREE.MeshStandardMaterial({ map: Texturas.fachada(z.clasica), color: new THREE.Color(z.color).multiplyScalar(f), roughness: 0.9, side: THREE.DoubleSide,
          ...(brillo ? { emissive: new THREE.Color(z.color).multiplyScalar(f * brillo), emissiveMap: Texturas.fachada(z.clasica) } : {}) });
        return clave;
      });
      const muro = z.lado > 0 ? t.muroIzq : t.muroDer, d = (i) => z.lado * (muro[i] + z.dist), fondo = z.fondo ?? 14; // (fondo: m de edificio hacia fuera)
      // Trozos donde cabe (sin pisar otra parte del circuito)
      // (se mira el edificio entero, de la fachada a la pared de atrás: si solo se mira el fondo, en las horquillas
      //  la fachada puede quedar encima de la otra rama de la pista)
      // (09-11) ...ni el pit lane: en Mónaco la doble fila de Tabac acababa metida en la salida de boxes de Sainte-Dévote
      const lejosPit = (p) => !this._puntosPit.some(([x, zz]) => Math.hypot(x - p[0], zz - p[2]) < 16);
      const cabe = (i) => [0, 0.5, 1].every((f) => { const p = this._p(i, d(i) + z.lado * fondo * f); return t.distanciaPista(p[0], p[2], i) > t.hw + 4 + (f === 1 ? fondo : 0) && lejosPit(p); }); // (el fondo, con el margen de antes)
      // (09-11, 2ª revisión) Cada edificio es una caja CERRADA: fachada, pared de atrás, tejado y sus dos paredes de
      // los lados. Antes solo había pared lateral al principio de cada uno: si el siguiente era más bajo quedaba un
      // hueco por el que se veía el cielo, y los trozos sueltos de 1-2 m (donde casi no cabe) salían como láminas.
      // En el lado de dentro de una curva cerrada el edificio pierde fondo (si no, la pared de atrás se cruzaba).
      const clasica = !!z.clasica, cornisa = this._lote('cornisa', this.mat.cornisa || (this.mat.cornisa = new THREE.MeshStandardMaterial({ color: '#f7f1e3', roughness: 0.8, emissive: '#3c3a34', side: THREE.DoubleSide })));
      const pizarra = clasica ? this._lote('pizarra', this.mat.pizarra || (this.mat.pizarra = new THREE.MeshStandardMaterial({ color: '#7d8489', roughness: 0.85, side: THREE.DoubleSide }))) : null;
      for (const [a, m] of this._tramos((i) => Utils.envolver(i - i0, t.N) <= n && cabe(i))) {
        if (m * t.ds < 10) continue; // (trozo suelto donde casi no cabe: salía una lámina)
        const nTrozos = Math.max(1, Math.round(m / 12));
        for (let k = 0; k < nTrozos; k++) {
          const j0 = Math.round(k * m / nTrozos), largo = Math.round((k + 1) * m / nTrozos) - j0, ia = a + j0;
          // Fondo: en el lado de dentro de una curva, como mucho el 85 % del radio menos la distancia a la pista
          let F = fondo;
          for (let j = 0; j <= largo; j++) {
            const ii = (((ia + j) % t.N) + t.N) % t.N, kk = t.kLarga[ii];
            if (Math.sign(kk) === Math.sign(z.lado) && kk !== 0) F = Math.min(F, 0.85 / Math.abs(kk) - Math.abs(d(ii)));
          }
          if (F < 4) continue;
          const alto = z.alto * (0.8 + this.rnd() * 0.4), clave = tonos[Math.floor(this.rnd() * 3)], L = this._lote(clave, this.mat[clave]);
          const atras = (i) => d(i) + z.lado * F;
          this._pared(L, ia, largo, d, -14, alto, 12, 2); // (desde 14 m por debajo: en cuesta el suelo baja y la pared no debe quedar colgando)
          this._pared(L, ia, largo, atras, -14, alto, 12, 2);
          if (clasica) { // Hôtel de Paris: cornisa clara y tejado de pizarra a dos aguas (mansarda)
            this._pared(cornisa, ia, largo, (i) => d(i) - z.lado * 0.5, alto - 0.9, alto + 0.3, 10, 2);
            this._cinta(cornisa, ia, largo, (i) => [d(i) - z.lado * 0.5, d(i)], alto + 0.3, 10, 2);
            this._cinta(pizarra, ia, largo, (i) => [d(i), d(i) + z.lado * F / 2], [alto, alto + 4.5], 10, 2);
            this._cinta(pizarra, ia, largo, (i) => [d(i) + z.lado * F / 2, atras(i)], [alto + 4.5, alto], 10, 2);
          } else this._cinta(this._lote('tejado', this.mat.tejado), ia, largo, (i) => [d(i), atras(i)], alto, 10, 2);
          for (const ie of [ia, ia + largo]) { // paredes de los lados
            const ii = ((ie % t.N) + t.N) % t.N, p = this._p(ii, d(ii) + z.lado * F / 2), h = alto + (clasica ? 4.5 : 0);
            this._caja(L, p[0], p[1] + (h - 14) / 2, p[2], F, h + 14, 0.3, this._angulo(ii)); // (16-11) sin el + 90°: la pared salía A LO LARGO de la calle (lámina de papel) y el lado quedaba abierto
          }
          const pm = this._p(ia, d(((ia % t.N) + t.N) % t.N) + z.lado * F / 2);
          this.ocupado.push([pm[0], pm[2], 9]); // (para que los edificios sueltos y las palmeras no se metan dentro)
        }
        // Rotonda con cúpula en la esquina (circuitos.js → fachadas[].cupula: 'ini' | 'fin'; Hôtel de Paris)
        if (z.cupula) {
          const ie = z.cupula === 'ini' ? a : a + m, ii = ((ie % t.N) + t.N) % t.N, p = this._p(ii, d(ii) + z.lado * 6), h = z.alto * 1.05;
          const mats = this.mat[tonos[1]], cobre = this.mat.cobreCupula || (this.mat.cobreCupula = new THREE.MeshStandardMaterial({ color: '#7f9c8c', roughness: 0.6, metalness: 0.2 }));
          const torre = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, h + 14, 16), mats); torre.position.set(p[0], p[1] + (h - 14) / 2, p[2]);
          const anillo = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 1, 16), this.mat.cornisa); anillo.position.set(p[0], p[1] + h + 0.4, p[2]);
          const cup = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cobre); cup.scale.y = 1.3; cup.position.set(p[0], p[1] + h + 0.9, p[2]);
          const lint = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 3.5, 8), this.mat.cornisa); lint.position.set(p[0], p[1] + h + 0.9 + 7.8 + 1.5, p[2]);
          for (const o of [torre, anillo, cup, lint]) { o.castShadow = true; o.receiveShadow = true; this.grupo.add(o); }
        }
      }
    });
  }

  // ---------- Edificios sueltos que se colocan donde QUEPAN (circuitos.js → edificios) ----------
  // { s, lado, tipo: 'hotel' | 'casino' | 'fuente', alto, color, max }. Se busca, desde el muro hacia fuera,
  // el cuadrado más grande (de "max" m hacia abajo) que no pise la pista (ni otro tramo, ni el agua, ni una
  // grada): la pista manda siempre. Si no cabe ni el más pequeño, no se pone (y la consola avisa)
  _buscarHueco(s, lado, max, min = 8, distMin = 2) { // distMin: metros desde el muro donde empieza a buscar
    const t = this.t, i = t.indice(s), muro = lado > 0 ? t.muroIzq[i] : t.muroDer[i], ang = this._angulo(i);
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const libre = (x, z, r) => {
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const px = x + (a * cs + b * sn) * r / 2, pz = z + (-a * sn + b * cs) * r / 2;
        if (t.distanciaPista(px, pz) < t.hw + 3 || t.enPuerto(px, pz)) return false;
      }
      return !this.ocupado.some(([ox, oz, or]) => or > 5 && Math.hypot(ox - x, oz - z) < or + r * 0.7);
    };
    for (let tam = max; tam >= min; tam -= 3) {
      for (let d = muro + distMin + tam / 2; d < muro + distMin + 70; d += 2) {
        const x = t.x[i] + t.nx[i] * lado * d, z = t.z[i] + t.nz[i] * lado * d;
        if (libre(x, z, tam / 2)) return { x, z, tam, ang, y: t.alturaXZ(x, z), frente: Math.atan2(-lado * t.nx[i], -lado * t.nz[i]) }; // (frente: hacia la pista)
      }
    }
    return null;
  }

  _edificios() {
    const t = this.t;
    for (const e of t.datos.edificios || []) {
      const h = this._buscarHueco(e.s, e.lado, e.max || 30, e.min || 8, e.distMin ?? 2);
      if (!h) { console.warn(`[${t.datos.nombre}] El edificio "${e.tipo}" de ${e.s} m no cabe sin pisar la pista: no se pone`); continue; }
      const g = new THREE.Group();
      g.position.set(h.x, h.y - 2, h.z); // (2 m enterrado: en cuesta no queda flotando)
      g.rotation.y = h.frente; // (su +z mira a la pista)
      if (e.tipo === 'fuente') g.add(...this._fuente(h.tam));
      else if (e.tipo === 'noria') g.add(...this._noria(e.alto || 40));
      else if (e.tipo === 'casino') g.add(...this._casino(h.tam, e.alto || 20, e.color || '#efdcb4'));
      else g.add(...this._bloque(h.tam, e.alto || 24, e.color || '#e8e0d0', false));
      g.traverse((m) => { if (m.isMesh) { m.castShadow = e.tipo !== 'fuente' && e.tipo !== 'noria'; m.receiveShadow = true; } });
      this.grupo.add(g);
      this.ocupado.push([h.x, h.z, h.tam * 0.75]);
    }
  }

  // Edificio de planta cuadrada (tam × tam, "alto" m) con fachadas por los 4 lados y tejado.
  // El Casino: fachada clásica, dos torres en la fachada y tejado verde de cobre
  _bloque(tam, alto, color, casino) {
    const tex = Texturas.fachada(casino).clone();
    tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(tam / 12)), Math.max(1, Math.round(alto / 22)));
    const fach = new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.9 });
    const tejado = new THREE.MeshStandardMaterial({ color: casino ? '#6f9a85' : '#a9623c', roughness: 0.9 });
    const piezas = [new THREE.Mesh(new THREE.BoxGeometry(tam, alto + 2, tam), [fach, fach, tejado, tejado, fach, fach])];
    piezas[0].position.y = (alto + 2) / 2;
    if (casino) {
      for (const lado of [-1, 1]) { // dos torres a los lados de la fachada (hacia la pista)
        const torre = new THREE.Mesh(new THREE.BoxGeometry(tam * 0.16, alto * 0.55, tam * 0.16), [fach, fach, tejado, tejado, fach, fach]);
        torre.position.set(lado * tam * 0.38, alto + 2 + alto * 0.27, tam * 0.4); // (+z: el lado que mira a la pista)
        const punta = new THREE.Mesh(new THREE.ConeGeometry(tam * 0.12, alto * 0.3, 4), tejado);
        punta.position.set(lado * tam * 0.38, alto + 2 + alto * 0.55 + alto * 0.15, tam * 0.4); punta.rotation.y = Math.PI / 4;
        piezas.push(torre, punta);
      }
      const cubierta = new THREE.Mesh(new THREE.ConeGeometry(tam * 0.55, alto * 0.25, 4), tejado); // tejado a cuatro aguas
      cubierta.position.y = alto + 2 + alto * 0.125; cubierta.rotation.y = Math.PI / 4;
      piezas.push(cubierta);
    }
    return piezas;
  }

  // El Casino de Montecarlo (estilo Beaux-Arts), mirando a la pista (+z): cuerpo principal de dos plantas con
  // ventanas en arco, un pabellón central más alto y adelantado con reloj y marquesina de cristal, dos torres
  // con cúpula de cobre a sus lados, alas laterales más bajas, cornisas claras y tejados de cobre verde
  _casino(tam, alto, color) {
    const tex = (ancho, h) => { const x = Texturas.fachadaCasino().clone(); x.needsUpdate = true; x.repeat.set(Math.max(1, Math.round(ancho / 9)), 1); return x; };
    // (09-11: con emisivo suave, como visual.brilloFachadas: a la sombra salía marrón oscuro; en las fotos es piedra crema)
    const em = new THREE.Color(color).multiplyScalar(this.vis.brilloFachadas || 0.3);
    const piedra = (ancho, h) => new THREE.MeshStandardMaterial({ map: tex(ancho, h), color, roughness: 0.85, emissive: em, emissiveMap: tex(ancho, h) });
    const liso = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: em });
    const claro = new THREE.MeshStandardMaterial({ color: '#f6efe0', roughness: 0.8 });   // cornisas
    const cobre = new THREE.MeshStandardMaterial({ color: '#6f9a85', roughness: 0.7, metalness: 0.2 });
    const cristal = new THREE.MeshStandardMaterial({ color: '#2b3a44', roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.85 });
    const oro = new THREE.MeshStandardMaterial({ color: '#c9a64a', roughness: 0.4, metalness: 0.6 });
    const piezas = [];
    const caja = (w, h, d, x, y, z, m) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Array.isArray(m) ? m : m); p.position.set(x, y, z); piezas.push(p); return p; };
    const tejado = (w, d, h, x, y, z) => { const g = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.6, Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); const p = new THREE.Mesh(g, cobre); p.scale.set(w, h, d); p.position.set(x, y + h / 2, z); piezas.push(p); };
    const cuerpo = (w, h, d, x, z, techo = 0.22) => { // fachada en los 4 lados + cornisa + tejado mansarda
      const f = piedra(w, h), fl = piedra(d, h);
      caja(w, h, d, x, h / 2, z, [fl, fl, liso, liso, f, f]);
      caja(w + 0.8, 0.7, d + 0.8, x, h + 0.35, z, claro);               // cornisa
      caja(w + 0.2, 0.9, d + 0.2, x, h + 1.15, z, claro);                // balaustrada (bloque claro)
      tejado(w, d, h * techo, x, h + 1.6, z);
    };
    const W = tam, Dp = tam * 0.55, h1 = alto * 0.7;
    cuerpo(W * 0.62, h1, Dp, 0, -tam * 0.12);                                   // cuerpo principal
    for (const s of [-1, 1]) cuerpo(W * 0.19, h1 * 0.82, Dp * 0.8, s * W * 0.405, -tam * 0.12, 0.3); // alas laterales
    const hc = alto * 0.9, zc = -tam * 0.12 + Dp / 2 + 1.2;
    cuerpo(W * 0.26, hc, 5, 0, zc - 1.2, 0.35);                                  // pabellón central adelantado
    for (const s of [-1, 1]) {                                                   // torres con cúpula
      const xt = s * W * 0.17, ht = alto * 1.25, at = W * 0.075;
      caja(at, ht, at, xt, ht / 2, zc, [piedra(at, ht), piedra(at, ht), liso, liso, piedra(at, ht), piedra(at, ht)]);
      caja(at + 0.6, 0.6, at + 0.6, xt, ht + 0.3, zc, claro);
      const cupula = new THREE.Mesh(new THREE.SphereGeometry(at * 0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cobre);
      cupula.scale.y = 1.6; cupula.position.set(xt, ht + 0.6, zc); piezas.push(cupula);
      const linterna = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 6), oro);
      linterna.position.set(xt, ht + 0.6 + at * 0.62 * 1.6 + 0.9, zc); piezas.push(linterna);
    }
    // Reloj en el frente del pabellón central y marquesina de cristal sobre la entrada
    const reloj = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.5 }));
    reloj.position.set(0, hc - 2.2, zc + 1.31); piezas.push(reloj);
    const aro = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 20), oro); aro.position.copy(reloj.position); aro.position.z += 0.01; piezas.push(aro);
    const marquesina = caja(W * 0.3, 0.3, 4, 0, 4.6, zc + 2.6, cristal); marquesina.rotation.x = -0.12;
    for (const s of [-1, 1]) caja(0.25, 4.6, 0.25, s * W * 0.14, 2.3, zc + 4.3, oro); // postes de hierro dorado
    caja(W * 0.34, 0.5, 3, 0, 0.25, zc + 2.2, claro);                            // escalinata
    return piezas;
  }

  // Noria (Silverstone, detrás de Brooklands): dos aros blancos con radios, cabinas de colores y patas en A.
  // Pocas piezas y de pocos lados: se ve de lejos
  _noria(alto) {
    const R = alto / 2 - 1, eje = alto / 2 + 1, piezas = [];
    const blanco = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.5, metalness: 0.3 });
    const pieza = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; piezas.push(m); return m; };
    for (const z of [-1.2, 1.2]) pieza(new THREE.TorusGeometry(R, 0.35, 4, 40), blanco, 0, eje, z);
    for (let k = 0; k < 12; k++) pieza(new THREE.BoxGeometry(0.25, R * 2, 0.25), blanco, 0, eje, 0, (k * Math.PI) / 12);
    const colores = ['#d7263d', '#1b998b', '#f4d35e', '#2e86ab', '#f46036'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI * 2) / 16;
      pieza(new THREE.BoxGeometry(1.6, 2, 1.6), colores[k % colores.length], Math.cos(a) * R, eje + Math.sin(a) * R - 1.2, 0);
    }
    for (const z of [-2.5, 2.5]) for (const s of [-1, 1]) { // patas en A
      const largo = Math.hypot(eje, alto * 0.25), ang = Math.atan2(alto * 0.25, eje);
      pieza(new THREE.BoxGeometry(0.6, largo, 0.6), blanco, s * alto * 0.125, eje / 2, z, s * ang);
    }
    pieza(new THREE.BoxGeometry(alto * 0.6, 3, 8), new THREE.MeshStandardMaterial({ color: '#6b7078', roughness: 0.8 }), 0, 1.5, 0); // caseta
    return piezas;
  }

  // Fuente redonda de la plaza del Casino: pilón de piedra, agua y una columna con taza en el centro
  _fuente(tam) {
    const r = tam * 0.45, piedra = new THREE.MeshStandardMaterial({ color: '#e6e1d6', roughness: 0.8 });
    const agua = new THREE.MeshStandardMaterial({ color: '#7fc4e0', roughness: 0.1, metalness: 0.3 });
    const cesped = new THREE.MeshStandardMaterial({ color: '#4f8f3a', roughness: 1 });
    const p = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; return m; };
    return [
      p(new THREE.CylinderGeometry(tam * 0.7, tam * 0.7, 2.1, 28), cesped, 1.05),   // césped alrededor
      p(new THREE.CylinderGeometry(r, r, 2.8, 28), piedra, 1.4),                    // pilón
      p(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.1, 28), agua, 2.82),         // agua
      p(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 10), piedra, 3.9),                // columna
      p(new THREE.CylinderGeometry(r * 0.3, 0.4, 0.5, 18), piedra, 5.2),            // taza
    ];
  }

  // ---------- Jardines con palmeras (circuitos.js → jardines): los del Casino ----------
  _jardines() {
    const t = this.t;
    if (!this.mat.tronco) {
      this.mat.tronco = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 });
      this.mat.hojaPalmera = new THREE.MeshStandardMaterial({ color: '#3f7a32', roughness: 0.9, side: THREE.DoubleSide });
    }
    const tronco = this._lote('tronco', this.mat.tronco), hojas = this._lote('hojaPalmera', this.mat.hojaPalmera);
    this._porZonas(t.datos.jardines, (z, i0, n) => {
      const muro = z.lado > 0 ? t.muroIzq : t.muroDer;
      // Césped del jardín (en Mónaco el suelo es pavimento: el verde solo aquí)
      if (!this.mat.cespedJardin) { this.mat.cespedJardin = new THREE.MeshStandardMaterial({ map: Texturas.cesped(t.datos.cesped || '#4f8f3a', 0.04), roughness: 1 }); this._capa(this.mat.cespedJardin, 1); }
      // Ancho del césped en cada punto: se recorta antes de llegar a otro tramo (en la horquilla, la otra rama)
      // (distancia a la pista sin contar solo los ±30 m de este punto: distanciaPista se salta ±220 m y en la
      //  horquilla la otra rama está más cerca que eso)
      const libre = (x, zz, i) => { let d = 999; for (let k = 0; k < t.N; k++) { const e = Utils.envolver(k - i, t.N); if (Math.min(e, t.N - e) * t.ds < 30) continue; d = Math.min(d, Math.hypot(t.x[k] - x, t.z[k] - zz)); } return d; };
      const anchoCesped = (i) => {
        let w = 3 + (z.fondo ?? 8) + 4;
        while (w > 1) { const q = this._p(i, z.lado * (muro[i] + w)); if (libre(q[0], q[2], i) > t.hw + 2) break; w -= 1; }
        return w;
      };
      // (solo en los trozos donde cabe una franja de verdad; todo el césped, del borde al fondo, lejos de otros tramos)
      const cabeCesped = (i) => { if (anchoCesped(i) < 5) return false; const q = this._p(i, z.lado * (muro[i] + 0.5)); return libre(q[0], q[2], i) > t.hw + 2; };
      for (const [a, m] of this._tramos((i) => Utils.envolver(i - i0, t.N) <= n && cabeCesped(i)))
        this._cinta(this._lote('cespedJardin', this.mat.cespedJardin), a, m, (i) => [z.lado * (muro[i] + 0.5), z.lado * (muro[i] + anchoCesped(i))], -0.3, 10, 2);
      const total = z.palmeras || z.arboles || 8;
      for (let k = 0; k < total; k++) {
        const i = (i0 + Math.floor(((k + 0.5) / total) * n)) % t.N;
        const p = this._p(i, z.lado * (muro[i] + 3 + this.rnd() * Math.max(0, Math.min(z.fondo ?? 8, anchoCesped(i) - 5)))); // (siempre encima del césped: no quedan flotando)
        if (!cabeCesped(i) || t.distanciaPista(p[0], p[2]) < t.hw + 3.5 || this.ocupado.some(([ox, oz, or]) => Math.hypot(ox - p[0], oz - p[2]) < or)) continue; // (sin pisar NINGÚN tramo, tampoco el otro lado de una horquilla, ni dentro de un edificio)
        if (z.arboles) { // árbol de copa redonda (jardín de la horquilla) en vez de palmera
          const alto = 3 + this.rnd() * 2, r = 2.2 + this.rnd() * 1.6;
          this._caja(tronco, p[0], p[1] + alto / 2, p[2], 0.5, alto, 0.5, 0);
          const copa = new THREE.Mesh(this._geoCopa || (this._geoCopa = new THREE.IcosahedronGeometry(1, 1)), this.mat.copa || (this.mat.copa = new THREE.MeshStandardMaterial({ color: '#4c7f3a', roughness: 1, flatShading: true })));
          copa.scale.set(r, r * 0.85, r); copa.position.set(p[0], p[1] + alto + r * 0.6, p[2]); copa.castShadow = true;
          this.grupo.add(copa);
        } else {
          const alto = 7 + this.rnd() * 4, ang = this.rnd() * Math.PI;
          this._caja(tronco, p[0], p[1] + alto / 2, p[2], 0.45, alto, 0.45, ang);
          for (let h = 0; h < 4; h++) this._caja(hojas, p[0], p[1] + alto, p[2], 0.25, 0.35, 6, ang + (h * Math.PI) / 4); // (copa en estrella)
        }
        this.ocupado.push([p[0], p[2], 4]);
      }
    });
  }

  // ---------- Muelle del puerto (circuitos.js → puerto): pared de hormigón del borde hasta el agua ----------
  _muelle() {
    const t = this.t;
    for (const P of t.zonasAgua) {
      const i0 = t.indice(P.sIni), n = Math.round((P.sFin - P.sIni) / t.ds);
      const muro = P.lado > 0 ? t.muroIzq : t.muroDer;
      this._pared(this._lote('hormigon', this.mat.hormigon), i0, n, (i) => P.lado * (muro[(i % t.N + t.N) % t.N] + 1.5), -14, 0.05, 10, 2); // (hasta 14 m por debajo: en Portier la pista va alta sobre el mar)
    }
  }

  _crearMallas() {
    for (const clave in this.lotes) {
      const { lote, material } = this.lotes[clave];
      if (lote.vacio) continue;
      const proyecta = ['gris', 'oscuro', 'hormigon', 'techo', 'naranja', 'cristal', 'tunel', 'techoTunel'].includes(clave) || clave.startsWith('pub') || clave.startsWith('eq');
      const m = lote.malla(material, { recibe: true, proyecta });
      m.name = clave;
      this.grupo.add(m);
    }
  }
}
