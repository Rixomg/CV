/* ============================================================
   TRAZADO — la "matemática" de un circuito.
   ------------------------------------------------------------
   A partir de las instrucciones de circuitos.js calcula:
   - Puntos cada ~2 m: posición, dirección, normal y curvatura.
   - El PERFIL DE VELOCIDAD: la velocidad máxima en cada punto
     (frenando antes de cada curva y acelerando a la salida).
   - La LÍNEA DE CARRERA: abrirse, tocar el vértice, abrirse.
   - Curvas con nombre, zonas de adelantamiento, boxes, escapatorias...
     (El juego es histórico: no hay DRS.)

   Hay DOS formas de describir un circuito (ver circuitos.js):
   - segmentos: "recta / curva" como una tortuga.
   - puntos: lista de puntos reales [x, y, ancho] (p. ej. Monza),
     cargada desde js/datos/<nombre>_puntos.js.

   Coordenadas 3D (Three.js): X = este, Z = sur, Y = arriba.
   "lateral" positivo = a la IZQUIERDA del sentido de la marcha.
   Curvatura positiva = curva a la DERECHA.

   ANCHO: hwArr[i] es la media anchura en cada muestra (variable
   en los circuitos por puntos). hw y anchura son la MEDIA, para
   lo que solo necesita un número (cámaras, árboles, tribunas...).
   ============================================================ */

class Trazado {
  constructor(datos) {
    this.datos = datos;

    if (datos.puntos) {
      this._desdePuntos();
    } else {
      this.anchura = datos.anchura;
      this.hw = datos.anchura / 2; // media anchura
      this._cerrarTrazado();
      this._muestrear();
      this.hwArr = new Float32Array(this.N).fill(this.hw); // ancho constante
    }
    // ALTURA de cada muestra (m): solo la traen los circuitos por puntos con 4.º valor (Mónaco); el resto, llanos
    if (!this.alt) this.alt = new Float32Array(this.N);
    let aMin = Infinity, aMax = -Infinity;
    for (let i = 0; i < this.N; i++) { aMin = Math.min(aMin, this.alt[i]); aMax = Math.max(aMax, this.alt[i]); }
    this.conAltura = aMax - aMin > 0.5;
    this._calcularCurvaturas();
    this._calcularLineaCarrera();   // (14-11) antes que la velocidad: la velocidad en curva sale de la curvatura de la trazada
    this._calcularPerfilVelocidad();
    this._calcularZonas();
    this._calcularBoxes();
    this._calcularEscapatorias();
  }

  // ---------- 1) Ajustar dos rectas para que el circuito cierre ----------
  _cerrarTrazado() {
    this.segmentos = this.datos.segmentos.map((s) => s.slice());
    const totalGrados = this.segmentos.reduce((t, s) => t + (s[0] === 'curva' ? s[2] : 0), 0);
    if (Math.abs(totalGrados - 360) > 0.01) {
      console.warn(`[${this.datos.nombre}] Los grados suman ${totalGrados}, deberían sumar 360`);
    }

    const [a, b] = this.datos.ajustar;
    const fin = this._recorrer().fin;
    const da = this._direccion(this._recorrer().rumbos[a]);
    const db = this._direccion(this._recorrer().rumbos[b]);
    // Resolver: da·Δa + db·Δb = -fin  (regla de Cramer)
    const det = da[0] * db[1] - da[1] * db[0];
    const deltaA = (-fin[0] * db[1] + fin[1] * db[0]) / det;
    const deltaB = (-da[0] * fin[1] + da[1] * fin[0]) / det;
    this.segmentos[a][1] += deltaA;
    this.segmentos[b][1] += deltaB;
    if (this.segmentos[a][1] < 60 || this.segmentos[b][1] < 60) {
      console.warn(`[${this.datos.nombre}] Las rectas ajustadas quedan demasiado cortas`, this.segmentos[a][1], this.segmentos[b][1]);
    }
  }

  // Dirección en el plano (x = este, y = norte) para un rumbo en radianes (0 = norte, horario)
  _direccion(rumbo) {
    return [Math.sin(rumbo), Math.cos(rumbo)];
  }

  // Recorre los segmentos como una tortuga. Devuelve el punto final y el rumbo de cada segmento.
  _recorrer() {
    let x = 0, y = 0, rumbo = 0;
    const rumbos = [];
    for (const seg of this.segmentos) {
      rumbos.push(rumbo);
      if (seg[0] === 'recta') {
        x += Math.sin(rumbo) * seg[1];
        y += Math.cos(rumbo) * seg[1];
      } else {
        const [, R, grados] = seg;
        const sg = Math.sign(grados);
        const ang = (Math.abs(grados) * Math.PI) / 180;
        const cx = x + sg * R * Math.cos(rumbo), cy = y - sg * R * Math.sin(rumbo);
        rumbo += sg * ang;
        x = cx - sg * R * Math.cos(rumbo);
        y = cy + sg * R * Math.sin(rumbo);
      }
    }
    return { fin: [x, y], rumbos };
  }

  // ---------- 2) Puntos cada ~2 metros ----------
  _muestrear() {
    const longitudes = this.segmentos.map((s) => (s[0] === 'recta' ? s[1] : (s[1] * Math.abs(s[2]) * Math.PI) / 180));
    this.L = longitudes.reduce((a, b) => a + b, 0);
    this.N = Math.round(this.L / 2);
    this.ds = this.L / this.N;
    const N = this.N;

    this.x = new Float32Array(N);
    this.z = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.nx = new Float32Array(N); // normal izquierda
    this.nz = new Float32Array(N);
    this.kBruta = new Float32Array(N);

    // Estado inicial de cada segmento
    const inicios = [];
    let px = 0, py = 0, rumbo = 0, s0 = 0;
    this.segmentos.forEach((seg, i) => {
      inicios.push({ px, py, rumbo, s0, len: longitudes[i] });
      if (seg[0] === 'recta') {
        px += Math.sin(rumbo) * seg[1];
        py += Math.cos(rumbo) * seg[1];
      } else {
        const sg = Math.sign(seg[2]), R = seg[1];
        const cx = px + sg * R * Math.cos(rumbo), cy = py - sg * R * Math.sin(rumbo);
        rumbo += (sg * Math.abs(seg[2]) * Math.PI) / 180;
        px = cx - sg * R * Math.cos(rumbo);
        py = cy + sg * R * Math.sin(rumbo);
      }
      s0 += longitudes[i];
    });
    this.inicioSegmentos = inicios;

    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      while (j < inicios.length - 1 && s >= inicios[j].s0 + inicios[j].len) j++;
      const ini = inicios[j], seg = this.segmentos[j], t = s - ini.s0;
      let X, Y, r;
      if (seg[0] === 'recta') {
        r = ini.rumbo;
        X = ini.px + Math.sin(r) * t;
        Y = ini.py + Math.cos(r) * t;
        this.kBruta[i] = 0;
      } else {
        const sg = Math.sign(seg[2]), R = seg[1];
        const cx = ini.px + sg * R * Math.cos(ini.rumbo), cy = ini.py - sg * R * Math.sin(ini.rumbo);
        r = ini.rumbo + (sg * t) / R;
        X = cx - sg * R * Math.cos(r);
        Y = cy + sg * R * Math.sin(r);
        this.kBruta[i] = sg / R;
      }
      // Paso a coordenadas 3D: z = -norte
      this.x[i] = X;
      this.z[i] = -Y;
      this.tx[i] = Math.sin(r);
      this.tz[i] = -Math.cos(r);
      this.nx[i] = -Math.cos(r);
      this.nz[i] = -Math.sin(r);
    }

    // Caja que contiene el circuito
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
    }
    this.caja = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  // ---------- 1b+2b) Circuito definido por PUNTOS reales ----------
  // Rellena lo mismo que _muestrear (x, z, tx, tz, nx, nz, kBruta, N, L, ds, caja)
  // más hwArr. Además gira la lista para que s = 0 sea la línea de meta.
  _desdePuntos() {
    const d = this.datos;
    const crudos = (window.PUNTOS_CIRCUITOS || {})[d.puntos];
    if (!crudos || crudos.length < 10) throw new Error(`[${d.nombre}] Faltan los puntos '${d.puntos}': ¿está cargado js/datos/${d.puntos}_puntos.js en index.html?`);
    const extra = d.anchoExtra || 0;
    // CSV (x = este, y = norte) → juego (x, z = -y). El ancho es el TOTAL.
    let P = crudos.map(([x, y, w, h]) => [x, -y, w + extra, h || 0]); // (4.º valor opcional: altura en m)

    // Sentido: horario visto desde arriba (norte arriba, este a la derecha), salvo los circuitos marcados
    // con antihorario: true (Interlagos), que se corren al revés. Área con signo en (x, norte = -z): negativa = horario.
    let area = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      area += a[0] * -b[1] - b[0] * -a[1];
    }
    if (d.antihorario ? area < 0 : area > 0) {
      P.reverse();
      console.warn(`[${d.nombre}] Los puntos venían en el sentido contrario: se han invertido.`);
    }

    // Spline periódica (Catmull-Rom) muy densa → tabla de longitud de arco
    const n = P.length, sub = 8;
    const denso = []; // [x, z, ancho, s]
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, e) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (3 * b - a - 3 * c + e) * t3);
        const x = cr(p0[0], p1[0], p2[0], p3[0]), z = cr(p0[1], p1[1], p2[1], p3[1]);
        const w = p1[2] + (p2[2] - p1[2]) * t, h = p1[3] + (p2[3] - p1[3]) * t;
        if (denso.length) { const q = denso[denso.length - 1]; s += Math.hypot(x - q[0], z - q[1]); }
        denso.push([x, z, w, s, h]);
      }
    }
    const q = denso[denso.length - 1];
    this.L = s + Math.hypot(denso[0][0] - q[0], denso[0][1] - q[1]);
    this.N = Math.round(this.L / 2);
    this.ds = this.L / this.N;
    if (d.longitudReal && Math.abs(this.L - d.longitudReal) > d.longitudReal * 0.02) {
      console.warn(`[${d.nombre}] Longitud ${this.L.toFixed(0)} m, se esperaban ~${d.longitudReal} m`);
    }

    // Remuestreo a distancia constante (ds) por la longitud de arco
    const N = this.N;
    const X = new Float32Array(N), Z = new Float32Array(N), W = new Float32Array(N), H = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const si = i * this.ds;
      while (j < denso.length - 1 && denso[j + 1][3] < si) j++;
      const a = denso[j], b = denso[(j + 1) % denso.length];
      const sb = j + 1 < denso.length ? b[3] : this.L;
      const f = sb > a[3] ? (si - a[3]) / (sb - a[3]) : 0;
      X[i] = a[0] + (b[0] - a[0]) * f;
      Z[i] = a[1] + (b[1] - a[1]) * f;
      W[i] = a[2] + (b[2] - a[2]) * f;
      H[i] = a[4] + (b[4] - a[4]) * f;
    }

    // (16-11) ALISADO DEL EJE. Los puntos reales (GPS/CSV) traen pequeños quiebros: el «recto» de la pista cambiaba a
    // saltos (hasta 56 °/s de un fotograma a otro) y los coches giraban a tirones aunque fueran perfectos. Se alisa la
    // posición del eje con una media móvil corta (CONFIG.carrera.alisarEje, metros a cada lado; 0 = como antes). Todo lo
    // demás (pista dibujada, muros, boxes, trazada) sale de este eje, así que cuadra igual que antes
    // (16-11, 2.ª versión) NO se cambia el eje (la simulación y el tutorial tienen que salir igual): solo se calcula aparte
    // una DIRECCIÓN alisada para dibujar los coches (txS/tzS, ver más abajo y muestra → salida.sx/sz)
    const mEje = (typeof CONFIG !== 'undefined' && CONFIG.carrera && CONFIG.carrera.alisarEje) ?? 0;
    const wEje = mEje > 0 ? Math.max(1, Math.round(mEje / this.ds)) : 0;
    const XsE = wEje ? Trazado.suavizar(X, wEje, 3) : X, ZsE = wEje ? Trazado.suavizar(Z, wEje, 3) : Z;

    // Rumbo (0 = norte, horario) y curvatura numérica: dRumbo / ds
    const rumbo = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      rumbo[i] = Math.atan2(X[b] - X[a], -(Z[b] - Z[a]));
    }
    let k = new Float32Array(N), giroTotal = 0;
    for (let i = 0; i < N; i++) {
      let dr = rumbo[(i + 1) % N] - rumbo[(i - 1 + N) % N];
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      k[i] = dr / (2 * this.ds);
      giroTotal += k[i] * this.ds;
    }
    k = Trazado.suavizar(k, 2, 2); // quita el ruido de los datos (~±4 m)
    if (Math.abs(Math.abs(giroTotal) - 2 * Math.PI) > 0.2) console.warn(`[${d.nombre}] El giro total es ${(giroTotal * 180 / Math.PI).toFixed(0)}°, debería ser 360°`);

    // Línea de meta: s = 0 a "distanciaMeta" metros antes del vértice
    // de la primera curva fuerte que sigue a la recta más larga.
    // (metaEnPrimerPunto: los datos ya empiezan en la línea de meta, como Mónaco)
    // (metaAdelante: metros que se adelanta la meta desde el primer punto; Silverstone: el CSV la pone justo tras Club
    //  y la parrilla caía en la curva)
    const desplazamiento = d.metaEnPrimerPunto ? Math.round((d.metaAdelante || 0) / this.ds) % N : this._buscarMeta(k, d.distanciaMeta ?? 680);
    const rot = (arr) => { const r = new Float32Array(N); for (let i = 0; i < N; i++) r[i] = arr[(i + desplazamiento) % N]; return r; };
    this.x = rot(X); this.z = rot(Z); this.kBruta = rot(k); this.alt = rot(H);
    const R = rot(rumbo);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    // (16-11) dirección ALISADA solo para dibujar (el eje real no cambia)
    const XsR = rot(XsE), ZsR = rot(ZsE);
    this.txS = new Float32Array(N); this.tzS = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = XsR[b] - XsR[a], dz = ZsR[b] - ZsR[a], l = Math.hypot(dx, dz) || 1;
      this.txS[i] = dx / l; this.tzS[i] = dz / l;
    }
    for (let i = 0; i < N; i++) {
      // Misma convención que _muestrear
      this.tx[i] = Math.sin(R[i]);
      this.tz[i] = -Math.cos(R[i]);
      this.nx[i] = -Math.cos(R[i]);
      this.nz[i] = -Math.sin(R[i]);
    }

    // Ancho variable (suavizado) y valores medios
    this.hwArr = Trazado.suavizar(rot(W).map((w) => w / 2), 10, 2);
    let suma = 0;
    for (let i = 0; i < N; i++) suma += this.hwArr[i];
    this.hw = suma / N;
    this.anchura = this.hw * 2;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
    }
    this.caja = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  // Recta más larga → primera curva fuerte después → s = 0 unos metros antes de su vértice
  _buscarMeta(k, distancia) {
    const N = this.N, ds = this.ds;
    const ks = Trazado.suavizar(k, 15 / ds, 2);
    const recto = (i) => Math.abs(ks[i]) < 1 / 1200;
    // Recta más larga (circular)
    let mejor = { ini: 0, len: 0 }, ini = -1, arranque = 0;
    while (arranque < N && recto(arranque)) arranque++;
    for (let j = 1; j <= N; j++) {
      const i = (arranque + j) % N;
      if (recto(i) && ini < 0) ini = arranque + j;
      if (!recto(i) && ini >= 0) {
        if (arranque + j - ini > mejor.len) mejor = { ini, len: arranque + j - ini };
        ini = -1;
      }
    }
    // Primera curva fuerte (radio < 80 m) tras el final de la recta, y su vértice
    let i = mejor.ini + mejor.len, n = 0;
    while (Math.abs(k[i % N]) < 1 / 80 && n++ < N) i++;
    while (Math.abs(k[(i + 1) % N]) >= Math.abs(k[i % N]) && n++ < N) i++;
    this._infoMeta = { rectaMetros: mejor.len * ds, verticeIndice: i % N };
    return ((i - Math.round(distancia / ds)) % N + N) % N;
  }

  // Media anchura en una posición s (metros)
  hwEn(s) {
    return this.valor(this.hwArr, s);
  }

  // Media móvil circular (varias pasadas ≈ campana de Gauss)
  static suavizar(arr, ventana, pasadas = 3) {
    const N = arr.length;
    let a = Float32Array.from(arr);
    const w = Math.max(1, Math.round(ventana));
    for (let p = 0; p < pasadas; p++) {
      const b = new Float32Array(N);
      let suma = 0;
      for (let k = -w; k <= w; k++) suma += a[(k + N) % N];
      for (let i = 0; i < N; i++) {
        b[i] = suma / (2 * w + 1);
        suma += a[(i + w + 1) % N] - a[(i - w + N) % N];
      }
      a = b;
    }
    return a;
  }

  _calcularCurvaturas() {
    const m = 1 / this.ds; // muestras por metro
    this.k = Trazado.suavizar(this.kBruta, 6 * m);         // curvatura suave (transiciones realistas)
    this.kLarga = Trazado.suavizar(this.kBruta, 60 * m);   // curvatura "de zona" (escapatorias, cámaras)
  }

  // ---------- 3) Perfil de velocidad del coche ideal ----------
  // (14-11) Velocidad máxima en una curva de curvatura k (1/radio, de la TRAZADA, no del eje). Agarre = mecánico +
  // aerodinámico (crece con v²): v² = g·(agarreBase + agarreAero·v²)·R  →  v² = g·agarreBase·R / (1 − g·agarreAero·R)
  // Antes se usaba el radio del eje + 0,9 × anchura para imitar la trazada, y eso hacía las horquillas demasiado
  // rápidas (11 m de radio → 19) y las curvas rápidas / chicanes demasiado lentas.
  static velocidadEnCurva(k) {
    const f = CONFIG.fisica;
    const ka = Math.abs(k);
    if (ka < 1e-5) return f.velocidadMax;
    const R = 1 / ka;
    const den = 1 - f.gravedad * f.agarreAero * R;
    if (den <= 0) return f.velocidadMax;
    return Math.min(f.velocidadMax, Math.sqrt((f.gravedad * f.agarreBase * R) / den));
  }

  static aceleracion(v) {
    const f = CONFIG.fisica;
    return Math.max(0.3, f.aceleracionBase * (1 - (v / f.velocidadMax) ** 2));
  }

  static frenada(v) {
    const f = CONFIG.fisica;
    return f.gravedad * (f.frenadaBase + f.frenadaAero * v * v);
  }

  _calcularPerfilVelocidad() {
    const N = this.N, ds = this.ds;
    const lim = new Float32Array(N);
    let iMin = 0;
    for (let i = 0; i < N; i++) {
      lim[i] = Trazado.velocidadEnCurva(this.kLinea[i]); // curvatura de la trazada (ver _calcularLineaCarrera)
      if (lim[i] < lim[iMin]) iMin = i;
    }
    const v = Float32Array.from(lim);
    // Hacia delante: no se puede acelerar más de lo que da el motor
    for (let n = 1; n <= 2 * N; n++) {
      const i = (iMin + n) % N, p = (i - 1 + N) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[p] * v[p] + 2 * Trazado.aceleracion(v[p]) * ds));
    }
    // Hacia atrás: hay que frenar a tiempo para la siguiente curva
    for (let n = 1; n <= 2 * N; n++) {
      const i = (iMin - n + 2 * N * 2) % N, sg = (i + 1) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[sg] * v[sg] + 2 * Trazado.frenada(v[sg]) * ds));
    }
    // (circuitos.js → factorVelocidad: todo el circuito algo más lento, para que la vuelta de CARRERA dure lo que la
    //  real; Mónaco e Interlagos salían a ritmo de pole)
    const fv = this.datos.factorVelocidad;
    if (fv) for (let i = 0; i < N; i++) v[i] *= fv;
    this.vRef = v;

    let t = 0, tCurva = 0;
    for (let i = 0; i < N; i++) {
      t += ds / v[i];
      if (Math.abs(this.k[i]) > 1 / 600) tCurva += ds / v[i];
    }
    this.tiempoReferencia = t; // vuelta perfecta del coche ideal (seg)
    // Sectores (circuitos.js → sectoresTiempo): dónde acaban S1 y S2, en metros, para que duren lo que en la realidad
    const st = this.datos.sectoresTiempo;
    this.limSector = null;
    if (st) {
      this.limSector = [];
      let acum = 0;
      for (let i = 0; i < N && this.limSector.length < 2; i++) { acum += ds / v[i]; if (acum >= st[this.limSector.length] * t) this.limSector.push((i + 1) * ds); }
    }
    this.fraccionCurva = tCurva / t; // parte de la vuelta que se pasa en curva (para el aire sucio)
  }

  // ---------- 4) Línea de carrera ----------
  // (14-11) TRAZADA de carrera = la línea de MÍNIMA CURVATURA dentro de la pista (lo que hace un piloto: abrir,
  // vértice, abrir, y en chicanes ir casi recto). Antes era un "sombrero mexicano" según la curvatura del eje, que no
  // enderezaba las chicanes ni las eses rápidas. Método: cada punto se mueve (solo a lo ancho, sin salirse de la
  // pista) hacia donde la curva quedaría más suave con sus vecinos: P = (4·(P−h + P+h) − (P−2h + P+2h)) / 6.
  // Se hace de grueso a fino (h = 48, 24, 12, 6 m) para que converja rápido.
  // Resultado: this.linea (m a lo ancho desde el eje, + = hacia la normal) y this.kLinea (curvatura de la trazada).
  _calcularLineaCarrera() {
    const N = this.N, ds = this.ds, X = this.x, Z = this.z;
    // Cuesta ~0,3 s por circuito: se guarda y se reutiliza si se vuelve a crear el mismo circuito en la sesión
    const clave = this.datos.nombre + '|' + N + '|' + this.L.toFixed(1) + '|' + ((typeof CONFIG !== 'undefined' && CONFIG.carrera && CONFIG.carrera.alisarLinea) ?? 6) + '|' + ((typeof CONFIG !== 'undefined' && CONFIG.carrera && CONFIG.carrera.alisarEje) ?? 0);
    const guardada = Trazado._cacheLinea.get(clave);
    if (guardada) { this.linea = guardada.linea; this.kLinea = guardada.kLinea; return; }
    const n = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N), max = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const l = Math.hypot(this.tx[i], this.tz[i]);
      nx[i] = this.tz[i] / l; nz[i] = -this.tx[i] / l;   // misma normal que muestra()
      max[i] = Math.max(0, this.hwArr[i] - 1.6);          // margen: medio coche + un poco
    }
    const PASADAS = 200, RELAJ = 0.7;                       // iteraciones por escala y cuánto se mueve cada vez
    for (const metros of [48, 24, 12, 6]) {
      const h = Math.max(1, Math.round(metros / ds));
      for (let it = 0; it < PASADAS; it++) {
        for (let i = 0; i < N; i++) {
          const a = (i - h + N) % N, b = (i + h) % N, a2 = (i - 2 * h + 2 * N) % N, b2 = (i + 2 * h) % N;
          const px = (4 * (X[a] + nx[a] * n[a] + X[b] + nx[b] * n[b]) - (X[a2] + nx[a2] * n[a2] + X[b2] + nx[b2] * n[b2])) / 6;
          const pz = (4 * (Z[a] + nz[a] * n[a] + Z[b] + nz[b] * n[b]) - (Z[a2] + nz[a2] * n[a2] + Z[b2] + nz[b2] * n[b2])) / 6;
          const objetivo = (px - X[i]) * nx[i] + (pz - Z[i]) * nz[i];
          n[i] = Utils.limitar(n[i] + RELAJ * (objetivo - n[i]), -max[i], max[i]);
        }
      }
    }
    // (16-11) ALISADO FINAL. La última escala del cálculo mira los puntos de 3 en 3 (6 m) y deja tres «hilos» entrelazados
    // sin unir: la trazada salía en DIENTES DE SIERRA (cambiaba de sentido en 6 de cada 10 puntos; seguirla pedía tirones de
    // lado de 8-19 g) y los coches tiritaban con cualquier física. Se pasa una media móvil corta (CONFIG.carrera.alisarLinea,
    // metros a cada lado; 0 = como antes) y se vuelve a meter dentro de la pista
    const mAlisar = (typeof CONFIG !== 'undefined' && CONFIG.carrera && CONFIG.carrera.alisarLinea) ?? 6;
    if (mAlisar > 0) {
      const lisa = Trazado.suavizar(n, Math.max(1, Math.round(mAlisar / ds)), 3);
      for (let i = 0; i < N; i++) n[i] = Utils.limitar(lisa[i], -max[i], max[i]);
    }
    this.linea = n;
    // Curvatura de la trazada: círculo por 3 puntos a ±6 m, suavizada 8 m
    const h = Math.max(1, Math.round(6 / ds)), k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - h + N) % N, b = (i + h) % N;
      const ax = X[a] + nx[a] * n[a], az = Z[a] + nz[a] * n[a];
      const bx = X[i] + nx[i] * n[i], bz = Z[i] + nz[i] * n[i];
      const cx = X[b] + nx[b] * n[b], cz = Z[b] + nz[b] * n[b];
      const cruz = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const d = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
      k[i] = d > 0 ? 2 * cruz / d : 0;
    }
    this.kLinea = Trazado.suavizar(k, Math.max(1, Math.round(8 / ds)));
    Trazado._cacheLinea.set(clave, { linea: this.linea, kLinea: this.kLinea });
  }

  // ---------- 5) Curvas con nombre, zonas de adelantamiento, sectores ----------
  _calcularZonas() {
    const N = this.N, ds = this.ds, L = this.L;
    const rectas = this.datos.puntos ? this._zonasPorCurvatura() : this._zonasPorSegmentos();
    // Las curvas se llaman T1, T2, T3... en el orden de la vuelta (el nombre real queda en "nombreReal",
    // solo para encontrar las escapatorias de circuitos.js; en el juego no se enseña)
    this.curvas.forEach((c, i) => { c.nombreReal = c.nombre; c.nombre = `T${i + 1}`; c.numero = i + 1; });

    // Las 2 rectas más largas (ahí van los puentes publicitarios)
    this.rectasLargas = rectas
      .filter((r) => r.len >= 450)
      .sort((a, b) => b.len - a.len)
      .slice(0, 2)
      .map((r) => ({
        inicio: Utils.envolver(r.sIni + 90, L),
        fin: Utils.envolver(r.sIni + r.len - 40, L),
      }));

    // ¿Dónde se puede intentar adelantar? (recta por delante o frenada fuerte)
    this.zonaAdelantar = new Uint8Array(N);
    const mirar = Math.round(150 / ds), mirarFrenada = Math.round(120 / ds);
    for (let i = 0; i < N; i++) {
      let maxK = 0, minV = Infinity;
      for (let j = 0; j < mirar; j++) maxK = Math.max(maxK, Math.abs(this.k[(i + j) % N]));
      for (let j = 0; j < mirarFrenada; j++) minV = Math.min(minV, this.vRef[(i + j) % N]);
      const recta = maxK < 1 / 450;
      const frenada = this.vRef[i] > 50 && minV < this.vRef[i] * 0.72;
      this.zonaAdelantar[i] = recta || frenada ? 1 : 0;
    }
    this._calcularZonasAdelanto();
    this._calcularZonasAtaque();
  }

  // ZONAS DE ATAQUE para las batallas (batallas.js). Si el circuito las trae
  // a mano (circuitos.js → zonasAtaque) se usan esas; si no, se derivan de las
  // frenadas fuertes. Cada zona: { id, nombre, s, tipo, rectaAntes, rectaSiguiente, facilidad }
  //   s:              metros desde la meta donde se resuelve el duelo (el punto de frenada)
  //   tipo:           'frenada' (tirarse en la frenada) o 'recta' (adelantar en la recta con rebufo)
  //   rectaAntes:     metros de recta antes (más = más rebufo para "esperar")
  //   rectaSiguiente: metros de recta después de la curva (más = más fácil devolverla)
  //   facilidad:      0…1 (si no se pone, sale de la frenada y la recta)
  _calcularZonasAtaque() {
    const L = this.L, manual = this.datos.zonasAtaque;
    // Metros de recta (sin curvas fuertes) a partir de s, hacia delante (+1) o hacia atrás (−1)
    const recta = (s, sentido) => {
      let m = 0;
      while (m < 1500 && Math.abs(this.valor(this.k, s + sentido * m)) < 1 / 450) m += 10;
      return m;
    };
    // Recta después de la curva que empieza tras s (se salta la curva y mide lo que sigue)
    const rectaTras = (s) => {
      const c = this.curvas.find((x) => Utils.envolver(x.sIni - s, L) < 400) || this.curvaEn(s);
      return c ? recta(c.sFin + 10, 1) : 0;
    };
    const base = manual && manual.length
      ? manual.map((z) => ({ tipo: 'frenada', ...z }))
      : this.zonasAdelanto.filter((z) => z.frenada >= 30).map((z) => ({ nombre: z.nombre, s: z.s, tipo: 'frenada', rectaAntes: z.recta })); // (solo frenadas fuertes)
    // Además, CUALQUIER curva con frenada es una zona de ataque "secundaria": no es el sitio típico
    // (más difícil y arriesgado), pero si vas pegado te puedes tirar igual
    const fac = this.datos.facilidadSecundarias ?? CONFIG.batallas.facilidadSecundarias; // (cada circuito puede poner la suya: Mónaco, casi nada)
    if (fac > 0) for (const z of this.zonasAdelanto) { // (facilidadSecundarias: 0 → solo las zonas a mano)
      if (base.some((b) => Math.abs(Utils.envolver(b.s - z.s + L / 2, L) - L / 2) < 150)) continue;
      base.push({ nombre: z.nombre, s: z.s, tipo: 'frenada', rectaAntes: z.recta, facilidad: Utils.limitar(z.facilidad * fac, 0.03, 0.35), secundaria: true });
    }
    this.zonasAtaque = base.map((z, i) => {
      const s = Utils.envolver(z.s, L);
      const rectaAntes = z.rectaAntes ?? recta(s, -1);
      const rectaSiguiente = z.rectaSiguiente ?? rectaTras(s);
      const facilidad = z.facilidad ?? Utils.limitar(0.1 + Math.min(rectaAntes, 1100) / 1100 * 0.6, 0.05, 1);
      const curva = this.curvaEn(s + 30); // la zona se llama como la curva que viene (T1, T2...)
      return { ...z, nombreReal: z.nombre, nombre: curva ? curva.nombre : z.nombre, id: i, s, rectaAntes, rectaSiguiente, facilidad };
    }).sort((a, b) => a.s - b.s);
  }

  // Zonas con nombre para las DECISIONES de adelantamiento: las frenadas
  // fuertes y los finales de recta de este circuito.
  //   s:          dónde se resuelve el intento (donde empieza la frenada)
  //   facilidad:  0…1 (más frenada y más recta antes = más fácil y menos arriesgado)
  _calcularZonasAdelanto() {
    const ds = this.ds, L = this.L;
    const kRecta = 1 / 450;
    this.zonasAdelanto = [];
    this.curvas.forEach((c, k) => {
      // Velocidad máxima desde la curva anterior (máx. 500 m) y mínima dentro de la curva
      const previa = this.curvas[(k - 1 + this.curvas.length) % this.curvas.length];
      const atras = this.curvas.length > 1 ? Utils.limitar(Utils.envolver(c.sIni - previa.sFin, L), 40, 500) : 500;
      let vMax = 0, sMax = c.sIni, vMin = Infinity;
      for (let d = 0; d <= atras; d += ds) {
        const v = this.valor(this.vRef, c.sIni - d);
        if (v > vMax) { vMax = v; sMax = c.sIni - d; }
      }
      for (let s = c.sIni; s <= c.sFin; s += ds) vMin = Math.min(vMin, this.valor(this.vRef, s));
      // Metros de recta antes del punto de frenada
      let recta = 0;
      while (recta < 1500 && Math.abs(this.valor(this.k, sMax - recta)) < kRecta) recta += 10;
      const caida = vMax - vMin; // m/s que hay que frenar
      if (caida < 12) return;    // sin frenada de verdad (curva rápida a fondo): ahí no se adelanta
      this.zonasAdelanto.push({
        nombre: c.nombre,
        tipo: caida >= 25 ? 'Frenada fuerte' : 'Final de recta',
        s: Utils.envolver(sMax - 20, L),
        facilidad: Utils.limitar((caida / 55) * 0.6 + (Math.min(recta, 1100) / 1100) * 0.4, 0.05, 1),
        frenada: caida,
        recta,
      });
    });
  }

  // Curvas y rectas a partir de los segmentos con nombre
  _zonasPorSegmentos() {
    const L = this.L;
    // Curvas
    this.curvas = [];
    let numero = 0;
    this.segmentos.forEach((seg, i) => {
      if (seg[0] !== 'curva') return;
      const ini = this.inicioSegmentos[i];
      const nombre = seg[3];
      const anterior = this.curvas[this.curvas.length - 1];
      numero++;
      if (nombre && anterior && anterior.nombre === nombre && Math.abs(anterior.sFin - ini.s0) < 1) {
        anterior.sFin = ini.s0 + ini.len;
      } else {
        this.curvas.push({ nombre: nombre || `Curva ${numero}`, numero, sIni: ini.s0, sFin: ini.s0 + ini.len });
      }
    });

    // Rectas (uniendo la última con la primera, que cruzan la meta)
    const rectas = [];
    this.segmentos.forEach((seg, i) => {
      if (seg[0] === 'recta') rectas.push({ sIni: this.inicioSegmentos[i].s0, len: seg[1] });
    });
    const primera = rectas[0], ultima = rectas[rectas.length - 1];
    if (rectas.length > 1 && primera.sIni === 0 && Math.abs(ultima.sIni + ultima.len - L) < 1) {
      ultima.len += primera.len;
      rectas.shift();
    }
    this.rectaPrincipal = { inicio: this.inicioSegmentos[this.segmentos.length - 1].s0, longitudFinal: this.segmentos[this.segmentos.length - 1][1], longitudInicial: this.segmentos[0][1] };
    return rectas;
  }

  // Curvas y rectas detectadas por la curvatura (circuitos por puntos).
  // Una "curva" es un tramo con |k| > umbral; los tramos cercanos se fusionan
  // y, si hay nombres en datos.nombresCurvas, se agrupan hasta tener tantos como nombres.
  _zonasPorCurvatura() {
    const N = this.N, ds = this.ds, L = this.L;
    const umbral = this.datos.umbralCurva ?? 1 / 600;
    // Curvatura suavizada a ~20 m: las curvas largas no se parten en trocitos
    const kDet = Trazado.suavizar(this.kBruta, 20 / ds);
    const tramos = [];
    let ini = -1;
    for (let i = 0; i <= N; i++) {
      const c = i < N && Math.abs(kDet[i]) > umbral;
      if (c && ini < 0) ini = i;
      if (!c && ini >= 0) {
        let giro = 0, kMax = 0;
        for (let j = ini; j < i; j++) { giro += this.kBruta[j] * ds; kMax = Math.max(kMax, Math.abs(this.k[j])); }
        tramos.push({ sIni: ini * ds, sFin: i * ds, giro: giro * 180 / Math.PI, kMax, partes: 1 });
        ini = -1;
      }
    }
    // Un tramo que cruce la meta llega partido en dos: se unen
    if (tramos.length > 1 && tramos[0].sIni === 0 && Math.abs(tramos[tramos.length - 1].sFin - N * ds) < 1e-3) {
      const ult = tramos.pop();
      tramos[0].sIni = ult.sIni - L;
      tramos[0].giro += ult.giro;
      tramos[0].kMax = Math.max(tramos[0].kMax, ult.kMax);
    }
    const unir = (a, b) => ({ sIni: a.sIni, sFin: b.sFin, giro: a.giro + b.giro, kMax: Math.max(a.kMax, b.kMax), partes: a.partes + b.partes, cerrada: a.cerrada || b.cerrada });
    // Quitar quiebros de menos de 10° (no son curvas de verdad) y unir piezas a < 30 m (chicanes)
    this.curvasDescartadas = tramos.filter((c) => Math.abs(c.giro) < 10).map((c) => `${c.sIni.toFixed(0)} m (${c.giro.toFixed(0)}°)`);
    let grupos = tramos.filter((c) => Math.abs(c.giro) >= 10);
    for (const g of grupos) g.cerrada = g.kMax > 1 / 100; // radio < 100 m
    for (let g = 0; g < grupos.length - 1; g++) {
      if (grupos[g + 1].sIni - grupos[g].sFin < 30) { grupos.splice(g, 2, unir(grupos[g], grupos[g + 1])); g--; }
    }
    // Agrupar por proximidad hasta tener tantas curvas como nombres.
    // Se prefiere unir dos tramos suaves (p. ej. una curva larga partida)
    // antes que pegar una curva suave a una chicane cerrada.
    const nombres = this.datos.nombresCurvas || [];
    this.curvasFusionadas = [];
    const coste = (a, b) => (b.sIni - a.sFin) + (a.cerrada !== b.cerrada ? 200 : 0);
    while (nombres.length && grupos.length > nombres.length) {
      let m = 0;
      for (let g = 1; g < grupos.length - 1; g++) if (coste(grupos[g], grupos[g + 1]) < coste(grupos[m], grupos[m + 1])) m = g;
      grupos.splice(m, 2, unir(grupos[m], grupos[m + 1]));
      this.curvasFusionadas.push(m);
    }
    if (nombres.length && grupos.length < nombres.length) console.warn(`[${this.datos.nombre}] Solo se detectan ${grupos.length} curvas para ${nombres.length} nombres: baja "umbralCurva"`);
    this.curvas = grupos.map((g, i) => ({
      nombre: nombres[i] || `Curva ${i + 1}`,
      numero: i + 1,
      sIni: Utils.envolver(g.sIni, L),
      sFin: Utils.envolver(g.sIni, L) + (g.sFin - g.sIni),
      partes: g.partes,
      giro: g.giro,
    }));
    this.curvasFusionadas = this.curvas.filter((c) => c.partes > 1).map((c) => `${c.nombre}: ${c.partes} tramos`);

    // Rectas = huecos entre curvas (la última cruza la meta y enlaza con la primera)
    const rectas = [];
    for (let g = 0; g < grupos.length; g++) {
      const a = grupos[g], b = grupos[(g + 1) % grupos.length];
      const sIni = a.sFin, len = Utils.envolver(b.sIni - a.sFin, L);
      rectas.push({ sIni: Utils.envolver(sIni, L), len });
    }
    // Recta principal: la que contiene s = 0
    const principal = rectas.find((r) => r.sIni + r.len >= L || r.sIni === 0) || rectas[0];
    const longitudFinal = Utils.envolver(L - principal.sIni, L);
    this.rectaPrincipal = { inicio: principal.sIni, longitudFinal, longitudInicial: principal.len - longitudFinal };
    if (!this.datos.sinAvisos && (this.rectaPrincipal.longitudFinal < 400 || this.rectaPrincipal.longitudInicial < 400)) { // (24-11 CV) sinAvisos: Jerez tiene la recta corta de verdad
      console.warn(`[${this.datos.nombre}] La recta de meta es corta: ${longitudFinal.toFixed(0)} m antes y ${this.rectaPrincipal.longitudInicial.toFixed(0)} m después (hacen falta ≥ 400)`);
    }
    return rectas;
  }

  // ---------- 6) Boxes ----------
  _calcularBoxes() {
    const L = this.L;
    // Entrada y salida: por defecto, dentro de la recta de meta. Se pueden poner a mano (circuitos.js →
    // boxesEntrada / boxesSalida, en metros desde la meta; negativos = antes de la meta). Silverstone: se entra
    // antes de Vale y se sale en Farm, como en el real (el pit lane se salta Vale, Club y Abbey)
    const d = this.datos;
    const entrada = Utils.envolver(d.boxesEntrada ?? -Math.min(this.rectaPrincipal.longitudFinal - 60, 290), L);
    const salida = d.boxesSalida ?? Math.min(this.rectaPrincipal.longitudInicial - 120, 350);
    const longitud = Utils.envolver(salida - entrada, L);
    // Rampas de entrada y salida: en un pit lane corto (Mónaco, ~208 m) las de 130 m lo ocupaban todo y el
    // limitador no llegaba a aplicarse (la parada costaba 10 s): como mucho un 20 % del pit lane cada una
    const rampa = Math.min(CONFIG.boxes.rampa, longitud * 0.2);
    // El pit lane va paralelo a la pista a distancia fija: se usa la media anchura
    // MÁXIMA de ese tramo para que el muro nunca pise el asfalto
    let hw = 0;
    for (let u = 0; u <= longitud; u += this.ds) hw = Math.max(hw, this.hwEn(entrada + u));
    const lado = this.datos.boxesLado ?? (this.datos.antihorario ? 1 : -1); // boxes por dentro: a la derecha en horario, a la izquierda en antihorario (o circuitos.js → boxesLado)
    const huecos = EQUIPOS.length;
    const zonaUtil = longitud - 2 * rampa - 80;
    const separacion = Math.min(34, zonaUtil / huecos);
    let primerBox = rampa + 40 + (zonaUtil - separacion * (huecos - 1)) / 2;
    // Garajes centrados en un punto (circuitos.js → boxesCentro, m desde la meta): si el pit lane pasa por
    // curvas, los garajes se quedan en la recta (Silverstone: el edificio Wing, en la recta Hamilton)
    if (d.boxesCentro !== undefined) {
      const uc = Utils.envolver(d.boxesCentro - entrada, L) - separacion * (huecos - 1) / 2;
      primerBox = Utils.limitar(uc, rampa + 40, longitud - rampa - 40 - separacion * (huecos - 1));
    }

    this.boxes = {
      entrada, salida, longitud, lado, rampa, hw,
      lateralCarril: lado * (hw + 15),   // centro del carril rápido
      lateralParada: lado * (hw + 19.5), // donde se para el coche
      lateralMuro: lado * (hw + 5),      // muro entre pista y pit lane
      lateralGaraje: lado * (hw + 26),   // fachada de los garajes
      // u = metros recorridos desde la entrada del pit lane
      uBox: EQUIPOS.map((e, i) => primerBox + i * separacion),
      separacion,
      // (14-11, #9) El desvío hacia el pit lane a la ENTRADA se reparte en más metros que la rampa de velocidad: con
      // 130 m el coche giraba ~11-12° (y hasta 20° si cruzaba la pista tarde); con 200 m, ~7°. Solo cambia por dónde
      // se dibuja: la frenada, el limitador y lo que cuesta la parada son los mismos. Nunca llega a los garajes.
      rampaLateral: Math.max(rampa, Math.min(CONFIG.boxes.rampaLateralEntrada, longitud * 0.25, primerBox - 30)),
      // Velocidad en el pit lane (m/s): limitador del circuito (limitadorPit, km/h). Si el pit lane real es más
      // largo que el que cabe aquí (pitLaneReal, m), se va más despacio en proporción: tarda lo que tardaría en el real.
      limite: (this.datos.limitadorPit ? this.datos.limitadorPit / 3.6 : CONFIG.boxes.limiteVelocidad) * (this.datos.pitLaneEscalar ? longitud / this.datos.pitLaneReal : Math.min(1, longitud / (this.datos.pitLaneReal || longitud))), // (15-11) pitLaneEscalar: también más rápido si el del juego es más largo (Mónaco)
    };
    // (15-11, física) El desvío de SALIDA también se reparte en más metros (como la entrada): con 130 m el carril se
    // juntaba con la pista a ~11°; ahora converge poco a poco. Nunca empieza antes del último garaje.
    const uUlt = primerBox + separacion * (huecos - 1);
    this.boxes.rampaLateralSalida = Math.max(rampa, Math.min(CONFIG.boxes.rampaLateralSalida || rampa, longitud * 0.25, longitud - uUlt - separacion - 30));
    if (zonaUtil < 200 && !this.datos.sinAvisos) console.warn(`[${this.datos.nombre}] El pit lane es muy corto (${longitud.toFixed(0)} m)`);
    this._prepararCarrilPit();
  }

  // (15-11, física) El carril de boxes se dibuja (y lo siguen los coches) a una distancia del eje de la pista. Por
  // DENTRO de una curva cerrada, esa distancia podía ser mayor que el radio de la curva: el carril se doblaba sobre sí
  // mismo (salida de Montreal en la curva 1, Spa en La Source, Mónaco en Sainte-Dévote) y el coche daba media vuelta
  // de golpe (180°, giros de 3.000°/s). Y en una chicane (entrada de Montreal, Silverstone, Spa, Catalunya) el carril
  // copiaba los zigzags de la pista aumentados (radios de 1-3 m: los «latigazos» de la entrada).
  // Ahora se calcula una vez: 1) nunca más lejos del eje que una parte del radio de la curva (margenRadioPit), con
  // una transición suave; 2) se alisa el carril EN EL MUNDO (media de suavizadoCarrilPit metros), como un carril de
  // verdad, que va recto aunque la pista haga eses. Delante de los garajes no cambia nada.
  _prepararCarrilPit() {
    const b = this.boxes, ds = this.ds, CB = CONFIG.boxes, lado = b.lado;
    const n = Math.max(2, Math.ceil(b.longitud / ds) + 1);
    const lat = new Float32Array(n);
    for (let j = 0; j < n; j++) lat[j] = this._lateralPitLaneBase(Math.min(j * ds, b.longitud));
    this._latPit = null;
    if (!CB.margenRadioPit) return;
    const sj = (j) => b.entrada + Math.min(j * ds, b.longitud);
    const kk = new Float32Array(n);
    for (let j = 0; j < n; j++) { const i = this.indice(sj(j)); kk[j] = Math.max(0, -lado * this.k[i], -lado * (this.kBruta ? this.kBruta[i] : 0)); } // curva HACIA el lado del pit lane
    // 1) Distancia máxima al eje: margenRadioPit × radio − 7,5 m (borde del carril + muro), con una pendiente máxima
    //    (pendienteCarrilPit) para que se acerque y se aleje de la pista poco a poco
    const vK = Math.round(30 / ds), lim = new Float32Array(n), lim2 = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let k = 0; for (let i = Math.max(0, j - vK); i <= Math.min(n - 1, j + vK); i++) k = Math.max(k, kk[i]);
      lim[j] = k > 1e-5 ? Math.max(this.hwEn(sj(j)) - 2, CB.margenRadioPit / k - 7.5) : 1e9;
    }
    const pend = (CB.pendienteCarrilPit || 0.08) * ds, vC = Math.round(400 / ds);
    for (let j = 0; j < n; j++) { let m = lim[j]; for (let i = Math.max(0, j - vC); i <= Math.min(n - 1, j + vC); i++) m = Math.min(m, lim[i] + pend * Math.abs(i - j)); lim2[j] = m; }
    for (let j = 0; j < n; j++) if (Math.abs(lat[j]) > lim2[j]) lat[j] = lado * lim2[j];
    // 2) Alisado en el mundo: el carril busca la línea más recta posible dentro de un pasillo de ± holguraCarrilPit
    //    metros alrededor del de antes (0 en la entrada, en la salida y delante de los garajes, que no se mueven).
    //    Antes y después del pit lane, el carril "sigue" por el borde de la pista: así se funde con ella sin pico.
    const W = Math.round((CB.suavizadoCarrilPit || 0) / ds);
    if (W > 0) {
      const g0 = b.uBox[0] - b.separacion - 30, g1 = b.uBox[b.uBox.length - 1] + b.separacion + 30;
      const rE = Math.min(100, b.longitud * 0.15), pE = (u) => Utils.suave(0, rE, u) * (1 - Utils.suave(b.longitud - rE, b.longitud, u)); // (el pasillo se abre poco a poco: si no, el carril se tuerce siguiéndolo)
      const peso = (u) => pE(u) * (1 - Utils.suave(g0 - 100, g0, u) * (1 - Utils.suave(g1, g1 + 100, u)));
      const nn = n + 2 * W, m = {}, X = new Float64Array(nn), Z = new Float64Array(nn), cx = new Float64Array(nn), cz = new Float64Array(nn), nx = new Float64Array(nn), nz = new Float64Array(nn), lt = new Float64Array(nn);
      const lo = new Float64Array(n), hi = new Float64Array(n), H = CB.holguraCarrilPit || 6;
      for (let q = 0; q < nn; q++) {
        const j = q - W, sq = j < 0 ? b.entrada + j * ds : j >= n ? b.entrada + b.longitud + (j - n + 1) * ds : sj(j);
        this.muestra(sq, m); cx[q] = m.x; cz[q] = m.z; nx[q] = m.nx; nz[q] = m.nz;
        lt[q] = j < 0 || j >= n ? lado * (this.hwEn(sq) - 2) : lat[j];
      }
      for (let j = 0; j < n; j++) {
        const a = Math.abs(lat[j]), h = H * peso(j * ds), bo = this.hwEn(sj(j)) - 2;
        hi[j] = Math.max(bo, Math.min(lim2[j], a + h)); lo[j] = Math.min(hi[j], Math.max(bo, a - h * 0.25)); // (hacia la pista, poco: que no la pise)
      }
      for (let it = 0; it < 12; it++) {
        for (let q = 0; q < nn; q++) { X[q] = cx[q] + nx[q] * lt[q]; Z[q] = cz[q] + nz[q] * lt[q]; }
        for (let j = 1; j < n - 1; j++) {
          const q = j + W;
          let sx = 0, sz = 0; for (let i = q - W; i <= q + W; i++) { sx += X[i]; sz += Z[i]; }
          const l = (sx / (2 * W + 1) - cx[q]) * nx[q] + (sz / (2 * W + 1) - cz[q]) * nz[q];
          lt[q] = lado * Utils.limitar(lado * l, lo[j], hi[j]);
        }
      }
      for (let j = 0; j < n; j++) lat[j] = lt[j + W];
    }
    // (15-11, física) Radio del carril en cada punto (m), para que el coche no entre más rápido de lo que permite la curva
    const rad = new Float32Array(n), mm = {}, PX = new Float64Array(n), PZ = new Float64Array(n), V = 3;
    for (let j = 0; j < n; j++) { this.muestra(sj(j), mm); PX[j] = mm.x + mm.nx * lat[j]; PZ[j] = mm.z + mm.nz * lat[j]; }
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, j - V), c = Math.min(n - 1, j + V);
      if (c - a < 2) { rad[j] = 1e4; continue; }
      const h1 = Math.atan2(PX[j] - PX[a], PZ[j] - PZ[a]), h2 = Math.atan2(PX[c] - PX[j], PZ[c] - PZ[j]), dh = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
      rad[j] = dh > 1e-5 ? Math.min(1e4, (c - a) * ds * 0.5 / dh) : 1e4;
    }
    this._radioPit = rad;
    this._latPit = lat;
  }

  // Centro del pit lane en función de u (metros desde la entrada)
  lateralPitLane(u) {
    const L = this._latPit;
    if (!L) return this._lateralPitLaneBase(u);
    const x = Utils.limitar(u, 0, this.boxes.longitud) / this.ds, i = Math.min(L.length - 2, Math.floor(x)), f = Math.min(1, x - i);
    return L[i] + (L[i + 1] - L[i]) * f;
  }

  // (15-11, física) Radio de la curva del carril de boxes a "u" metros de su entrada (1e4 = recto)
  radioPitLane(u) {
    const R = this._radioPit;
    return R ? R[Math.min(R.length - 1, Math.max(0, Math.round(u / this.ds)))] : 1e4;
  }

  // (15-11, circuitos) Distancia al eje del MURO de boxes a "u" metros de la entrada. Normalmente fija (hw + 5); pero si
  // el carril se acerca a la pista en mitad del pit lane (Interlagos: la salida por dentro de la S de Senna), el muro
  // se arrima a la pista lo justo para quedar siempre entre la pista y el coche (medio coche + 0,6 m de margen).
  // Antes los coches lo atravesaban. Nunca pisa el asfalto de la pista (queda a 0,8 m de su borde como mínimo).
  lateralMuroPit(u) {
    const b = this.boxes, c = Math.abs(this.lateralPitLane(u)) - 1.6;
    return b.lado * Math.min(Math.abs(b.lateralMuro), Math.max(this.hwEn(b.entrada + u) + 0.8, c));
  }

  _lateralPitLaneBase(u) {
    const b = this.boxes;
    const entrada = Utils.suave(0, b.rampaLateral || b.rampa, u); // (14-11, #9) desvío de entrada más largo
    const salida = 1 - Utils.suave(b.longitud - (b.rampaLateralSalida || b.rampa), b.longitud, u); // (15-11, física) desvío de salida más largo
    const borde = b.lado * (b.hw - 2);
    // (circuitos.js → boxesSalidaCarril: { lateral, rampa }; Mónaco) La salida va por un carril propio pegado a la
    // pista, detrás del muro (a hw + lateral del eje), y solo se junta con la pista en los últimos "rampa" metros.
    // Antes se iba juntando poco a poco durante 118 m y, en Sainte-Dévote, los coches iban por el vértice.
    // Solo cambia por dónde se dibuja el coche: la distancia y el tiempo de la parada son los mismos.
    const S = this.datos.boxesSalidaCarril;
    if (S) {
      const uG = b.uBox[b.uBox.length - 1] + b.separacion; // pasado el último garaje
      const carril = Utils.lerp(b.lateralCarril, b.lado * (b.hw + S.lateral), Utils.suave(uG, uG + 50, u));
      return Utils.lerp(borde, carril, Math.min(entrada, 1 - Utils.suave(b.longitud - S.rampa, b.longitud, u)));
    }
    return Utils.lerp(borde, b.lateralCarril, Math.min(entrada, salida));
  }

  // ---------- 7) Escapatorias y muros ----------
  _calcularEscapatorias() {
    const N = this.N;
    this.gravaIzq = new Float32Array(N);
    this.gravaDer = new Float32Array(N);
    this.muroIzq = new Float32Array(N);
    this.muroDer = new Float32Array(N);
    const gravaMax = 24;
    for (let i = 0; i < N; i++) {
      const kl = this.kLarga[i];
      const exterior = Utils.limitar(Math.abs(kl) * 2600, 0, gravaMax);
      const interior = Math.min(3, exterior * 0.2);
      // Curva a la derecha (k > 0) → el exterior es la izquierda
      this.gravaIzq[i] = kl > 0 ? exterior : interior;
      this.gravaDer[i] = kl > 0 ? interior : exterior;
    }
    const escapatoriaAsfalto = 6;
    for (let i = 0; i < N; i++) {
      const hw = this.hwArr[i];
      const limiteInterior = Math.abs(this.k[i]) > 1e-4 ? 0.8 / Math.abs(this.k[i]) : Infinity;
      let izq = hw + 1.5 + escapatoriaAsfalto + this.gravaIzq[i] + 3;
      let der = hw + 1.5 + escapatoriaAsfalto + this.gravaDer[i] + 3;
      if (this.k[i] < 0) izq = Math.min(izq, limiteInterior);
      if (this.k[i] > 0) der = Math.min(der, limiteInterior);
      this.muroIzq[i] = Math.max(izq, hw + 3);
      this.muroDer[i] = Math.max(der, hw + 3);
    }
    // Circuito urbano (Mónaco): muros pegados a la pista y sin grava, salvo las escapatorias puestas a mano
    if (this.datos.muroCerca !== undefined) {
      for (let i = 0; i < N; i++) {
        this.gravaIzq[i] = 0; this.gravaDer[i] = 0;
        this.muroIzq[i] = this.muroDer[i] = this.hwArr[i] + this.datos.muroCerca;
      }
    }
    this.muroIzq = Trazado.suavizar(this.muroIzq, 10, 2);
    this.muroDer = Trazado.suavizar(this.muroDer, 10, 2);
    this._escapatoriasManuales();
  }

  // ---------- 7b) Escapatorias puestas a mano (circuitos.js → escapatorias) ----------
  // Cada una: { curva, lado, tipo, ancho, largo, despues, color }
  //   lado:  'exterior' | 'interior' (de la primera parte de la curva) | 'izquierda' | 'derecha'
  //   tipo:  'asfalto' | 'pintada' (verde con franjas) | 'grava'
  //   ancho: metros desde el borde de la pista
  //   largo: metros ANTES de la curva que cubre (la zona de frenada); despues: metros tras ella (30)
  // Sustituyen a la escapatoria automática de ese lado y mueven el muro.
  // Si chocan con otra parte del circuito se recortan (y la consola avisa).
  _escapatoriasManuales() {
    const N = this.N, ds = this.ds;
    this.escManual = [];
    this.manualIzq = new Uint8Array(N);
    this.manualDer = new Uint8Array(N);
    for (const e of this.datos.escapatorias || []) {
      // Por curva (nombre) o por metros (sIni/sFin desde la meta)
      const porMetros = e.sIni !== undefined && e.sFin !== undefined;
      const c = porMetros ? { sIni: e.sIni, sFin: e.sFin } : this.curvas.find((x) => x.nombreReal === e.curva || x.nombre === e.curva);
      if (!c) { console.warn(`[${this.datos.nombre}] Escapatoria: no existe la curva "${e.curva}"`); continue; }
      // Hacia dónde gira la primera parte de la curva (media de sus primeros 40 m)
      let kIni = 0;
      for (let d = 0; d < (porMetros ? c.sFin - c.sIni : 40); d += ds) kIni += this.valor(this.k, c.sIni + d); // (por metros: todo el tramo)
      const exterior = kIni > 0 ? 1 : -1; // curva a la derecha → exterior a la izquierda (+)
      const lado = e.lado === 'izquierda' ? 1 : e.lado === 'derecha' ? -1 : e.lado === 'interior' ? -exterior : exterior;
      const sA = porMetros ? e.sIni : c.sIni - (e.largo ?? 150), sB = porMetros ? e.sFin : c.sFin + (e.despues ?? 30);
      const n = Math.round((sB - sA) / ds), total = n * ds, rampa = Math.min(40, total / 4);
      const i0 = this.indice(sA);
      const anchos = new Float32Array(n + 1);
      const muro = lado > 0 ? this.muroIzq : this.muroDer, marca = lado > 0 ? this.manualIzq : this.manualDer;
      let recortada = false;
      // perfil 'recta' (Sainte-Dévote): vía de escape que sigue DE FRENTE desde la entrada de la curva. El asfalto
      // cubre lo que hay entre la pista (que gira) y esa recta, más un carril de 7 m
      const iR = this.indice(c.sIni), Rx = this.x[iR], Rz = this.z[iR], Tx = this.tx[iR], Tz = this.tz[iR];
      const aRecta = (i) => Math.abs((this.x[i] - Rx) * Tz - (this.z[i] - Rz) * Tx) + 7;
      for (let j = 0; j <= n; j++) {
        const i = (i0 + j) % N, hw = this.hwArr[i];
        const f = Utils.suave(0, rampa, j * ds) * (1 - Utils.suave(total - rampa, total, j * ds));
        let w = (e.perfil === 'recta' ? Math.min(e.ancho ?? 20, aRecta(i)) : (e.ancho ?? 20)) * f;
        // ¿Pisa otra parte del circuito? Se estrecha hasta que quepa
        while (w > 3) {
          const px = this.x[i] + this.nx[i] * lado * (hw + w), pz = this.z[i] + this.nz[i] * lado * (hw + w);
          if (this.distanciaPista(px, pz, i) > this.hw + 6) break;
          w -= 1.5;
          recortada = true;
        }
        anchos[j] = w;
        // El muro pasa a estar detrás de la escapatoria (mezclado con el automático en las rampas)
        muro[i] = Math.max(hw + 3, Utils.lerp(muro[i], hw + w + 1.5, f));
        if (w > 1) marca[i] = 1;
      }
      if (recortada) console.warn(`[${this.datos.nombre}] La escapatoria de "${e.curva}" no cabía entera: se ha recortado porque choca con otra parte del circuito.`);
      this.escManual.push({ curva: e.curva || `${Math.round(e.sIni)}–${Math.round(e.sFin)} m`, lado, tipo: e.tipo === 'asfaltoPintado' ? 'pintada' : e.tipo || 'asfalto', color: e.color, lisa: e.lisa, bandas: e.bandas, i0, n, anchos, recortada });
    }
  }

  // ---------- Índice espacial: para saber rápido si un punto está cerca de la pista ----------
  _crearIndiceEspacial() {
    this._celda = 40;
    this._rejilla = new Map();
    for (let i = 0; i < this.N; i += 2) {
      const clave = Math.floor(this.x[i] / this._celda) + ',' + Math.floor(this.z[i] / this._celda);
      if (!this._rejilla.has(clave)) this._rejilla.set(clave, []);
      this._rejilla.get(clave).push(i);
    }
  }

  // Distancia aproximada (hasta ~80 m) del punto al eje de la pista.
  // Si se pasa "excluir", ignora la zona de la pista cercana a esa muestra
  // (sirve para preguntar "¿choca con OTRA parte del circuito?").
  distanciaPista(x, z, excluir = -1) {
    if (!this._rejilla) this._crearIndiceEspacial();
    const cx = Math.floor(x / this._celda), cz = Math.floor(z / this._celda);
    let mejor = 999;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const lista = this._rejilla.get(cx + a + ',' + (cz + b));
      if (!lista) continue;
      for (const i of lista) {
        if (excluir >= 0) {
          const d = Math.abs(i - excluir);
          if (Math.min(d, this.N - d) * this.ds < 220) continue;
        }
        const dd = Math.hypot(this.x[i] - x, this.z[i] - z);
        if (dd < mejor) mejor = dd;
      }
    }
    return mejor;
  }

  // ---------- CONSULTAS ÚTILES ----------
  indice(s) {
    return Math.floor(Utils.envolver(s, this.L) / this.ds) % this.N;
  }

  // Interpolación entre dos muestras: rellena "salida" con x, z, tx, tz, nx, nz
  muestra(s, salida) {
    const u = Utils.envolver(s, this.L) / this.ds;
    const i = Math.floor(u) % this.N, j = (i + 1) % this.N, f = u - Math.floor(u);
    // (16-11) MOVIMIENTO «CUADRICULADO»: entre dos muestras (2 m) la posición iba en LÍNEA RECTA, así que el eje de la pista
    // era una línea quebrada con un codo cada 2 m: un coche a 220 km/h pasaba un codo cada fotograma y medio (tirones de
    // 10 g de un fotograma a otro, se veía temblar). Ahora se pasa una CURVA suave por las muestras (Catmull-Rom): en las
    // propias muestras da lo mismo que antes (la pista dibujada no cambia). CONFIG.carrera.ejeCurvo = false → como antes
    if (Trazado.ejeCurvo) {
      const N = this.N, h = (i - 1 + N) % N, k2 = (j + 1) % N, f2 = f * f, f3 = f2 * f;
      const c0 = -0.5 * f3 + f2 - 0.5 * f, c1 = 1.5 * f3 - 2.5 * f2 + 1, c2 = -1.5 * f3 + 2 * f2 + 0.5 * f, c3 = 0.5 * f3 - 0.5 * f2;
      salida.x = c0 * this.x[h] + c1 * this.x[i] + c2 * this.x[j] + c3 * this.x[k2];
      salida.z = c0 * this.z[h] + c1 * this.z[i] + c2 * this.z[j] + c3 * this.z[k2];
    } else {
      salida.x = this.x[i] + (this.x[j] - this.x[i]) * f;
      salida.z = this.z[i] + (this.z[j] - this.z[i]) * f;
    }
    salida.tx = this.tx[i] + (this.tx[j] - this.tx[i]) * f;
    salida.tz = this.tz[i] + (this.tz[j] - this.tz[i]) * f;
    const l = Math.hypot(salida.tx, salida.tz);
    salida.tx /= l; salida.tz /= l;
    salida.nx = salida.tz;
    salida.nz = -salida.tx;
    if (this.txS) { // (16-11) dirección alisada para dibujar (juego.js)
      let sx = this.txS[i] + (this.txS[j] - this.txS[i]) * f, sz = this.tzS[i] + (this.tzS[j] - this.tzS[i]) * f; const ls = Math.hypot(sx, sz) || 1;
      salida.sx = sx / ls; salida.sz = sz / ls;
    } else { salida.sx = salida.tx; salida.sz = salida.tz; }
    salida.k = Trazado.ejeCurvo ? this.k[i] + (this.k[j] - this.k[i]) * f : this.k[i]; // (16-11: la curvatura tampoco a escalones)
    salida.y = this.alt[i] + (this.alt[j] - this.alt[i]) * f; // altura (m)
    return salida;
  }

  // Altura de la pista a "s" metros de la meta y su pendiente (subida por metro: + = cuesta arriba)
  alturaEn(s) {
    return this.conAltura ? this.valor(this.alt, s) : 0;
  }

  pendienteEn(s) {
    return this.conAltura ? (this.valor(this.alt, s + 3) - this.valor(this.alt, s - 3)) / 6 : 0;
  }

  // Altura del CÉSPED dibujado (Mónaco): la del suelo, pero sin subir por encima de ningún tramo de pista
  // a menos de 14 m (ver alturaMinCerca), y 0,9 m por debajo para que no asome por el asfalto.
  // En el agua del puerto (enPuerto), el fondo queda por debajo del agua
  sueloXZ(x, z) {
    const P = this.enPuerto(x, z);
    if (P) return P.nivel - 3;
    return Math.min(this.alturaXZ(x, z), this.alturaMinCerca(x, z, 14)) - 0.9;
  }

  // Zonas de agua (circuitos.js → puerto: una o una lista; Mónaco: el puerto y el mar de Portier)
  get zonasAgua() {
    const P = this.datos.puerto;
    return P ? (Array.isArray(P) ? P : [P]) : [];
  }

  // ¿Es agua? Devuelve la zona de agua en la que cae (x, z), o null. Mira todas, o solo "P" si se pasa
  enPuerto(x, z, P = null) {
    if (!P) { for (const Z of this.zonasAgua) if (this.enPuerto(x, z, Z)) return Z; return null; }
    return this._enAgua(x, z, P) ? P : null;
  }

  // Caja (x0, x1, z0, z1) que contiene una zona de agua (se calcula una vez)
  cajaAgua(P) {
    if (!this._cajasAgua) this._cajasAgua = new Map();
    let c = this._cajasAgua.get(P);
    if (!c) {
      c = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      this._cajasAgua.set(P, c);
      for (let s = P.sIni; s <= P.sFin; s += this.ds) {
        const i = this.indice(s);
        for (const d of [0, P.ancho]) {
          const px = this.x[i] + this.nx[i] * P.lado * d, pz = this.z[i] + this.nz[i] * P.lado * d;
          c.x0 = Math.min(c.x0, px); c.x1 = Math.max(c.x1, px); c.z0 = Math.min(c.z0, pz); c.z1 = Math.max(c.z1, pz);
        }
      }
    }
    return c;
  }

  // ¿Es agua de la zona P = { sIni, sFin, lado, ancho, nivel }? El punto más cercano de la pista está entre
  // sIni y sFin, queda por el lado "lado", más allá del muelle (muro + 2 m) y a menos de "ancho" m, y no
  // está cerca de OTRO tramo del circuito (así el agua no llega a la recta de meta)
  _enAgua(x, z, P) {
    const c = this.cajaAgua(P);
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return false;
    // Muestra de pista más cercana (búsqueda en la rejilla, hasta ~ancho m)
    let mejor = Infinity, iM = -1;
    for (let i = 0; i < this.N; i += 4) {
      const d2 = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d2 < mejor) { mejor = d2; iM = i; }
    }
    const s = iM * this.ds;
    if (s < P.sIni || s > P.sFin) return false;
    const lat = (x - this.x[iM]) * this.nx[iM] + (z - this.z[iM]) * this.nz[iM];
    const muro = P.lado > 0 ? this.muroIzq[iM] : this.muroDer[iM];
    if (lat * P.lado < muro + 2 || Math.sqrt(mejor) > P.ancho) return false;
    return this.distanciaPista(x, z, iM) > 30;
  }

  // Altura más BAJA de la pista a menos de R metros del punto (o Infinity si no hay ninguna). La usa el
  // suelo de Mónaco: junto a un tramo bajo el césped no puede subir por encima de él (si no, salían
  // lomas pegadas a la pista donde el tramo de al lado va más alto)
  alturaMinCerca(x, z, R) {
    if (!this.conAltura) return Infinity;
    if (!this._rejilla) this._crearIndiceEspacial();
    const cx = Math.floor(x / this._celda), cz = Math.floor(z / this._celda), R2 = R * R;
    let min = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lista = this._rejilla.get(cx + a + ',' + (cz + b));
      if (lista) for (const i of lista) if ((this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 < R2 && this.alt[i] < min) min = this.alt[i];
    }
    return min;
  }

  // Altura del SUELO en un punto cualquiera del mundo: la de la pista más cercana, mezclando las
  // dos o tres muestras más próximas (así el terreno, los árboles y los edificios siguen las cuestas)
  alturaXZ(x, z) {
    if (!this.conAltura) return 0;
    if (!this._rejilla) this._crearIndiceEspacial();
    const cx = Math.floor(x / this._celda), cz = Math.floor(z / this._celda);
    let suma = 0, pesos = 0, mejor = Infinity, hMejor = 0;
    for (let r = 2; r <= 8 && pesos === 0; r += 3) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const lista = this._rejilla.get(cx + a + ',' + (cz + b));
        if (!lista) continue;
        for (const i of lista) {
          const d2 = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
          if (d2 < mejor) { mejor = d2; hMejor = this.alt[i]; }
          if (d2 < 3600) { const w = 1 / (d2 + 25); suma += this.alt[i] * w; pesos += w; }
        }
      }
      if (pesos === 0 && mejor < Infinity) return hMejor;
    }
    // Cerca de la pista manda su muestra más cercana (si no, otro tramo cercano a otra altura
    // la taparía); más lejos, se mezcla poco a poco con las de alrededor
    if (pesos > 0) { const f = Utils.limitar((Math.sqrt(mejor) - 15) / 30, 0, 1); return hMejor + (suma / pesos - hMejor) * f; }
    // Muy lejos: la muestra más cercana de todo el circuito (cada 10)
    for (let i = 0; i < this.N; i += 10) { const d2 = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d2 < mejor) { mejor = d2; hMejor = this.alt[i]; } }
    return hMejor;
  }

  // Valor interpolado de cualquier array por muestra (vRef, linea, ...)
  valor(arr, s) {
    const u = Utils.envolver(s, this.L) / this.ds;
    const i = Math.floor(u) % this.N, j = (i + 1) % this.N, f = u - Math.floor(u);
    return arr[i] + (arr[j] - arr[i]) * f;
  }

  curvaEn(s) {
    const sw = Utils.envolver(s, this.L);
    let mejor = null, distMejor = Infinity;
    for (const c of this.curvas) {
      if (sw >= c.sIni - 80 && sw <= c.sFin + 40) return c;
      const d = Utils.envolver(c.sIni - sw, this.L);
      if (d < distMejor) { distMejor = d; mejor = c; }
    }
    return mejor; // la próxima curva
  }

  // Sector (0, 1, 2) de una posición
  sector(s) {
    const x = Utils.envolver(s, this.L), l = this.limSector;
    if (l && l.length === 2) return x < l[0] ? 0 : x < l[1] ? 1 : 2;
    return Math.min(2, Math.floor((x / this.L) * 3));
  }
  // Metro donde empieza el sector k (0, 1, 2) y donde acaba (para pintarlos en el minimapa)
  limitesSector(k) {
    const l = this.limSector && this.limSector.length === 2 ? [0, this.limSector[0], this.limSector[1], this.L] : [0, this.L / 3, 2 * this.L / 3, this.L];
    return [l[k], l[k + 1]];
  }
}

// (14-11) Trazadas de mínima curvatura ya calculadas (ver _calcularLineaCarrera)
Trazado._cacheLinea = new Map();
// (16-11) eje de la pista en curva suave (ver muestra). Se lee de CONFIG.carrera.ejeCurvo al cargar
Trazado.ejeCurvo = !(typeof CONFIG !== 'undefined' && CONFIG.carrera && CONFIG.carrera.ejeCurvo === false);
