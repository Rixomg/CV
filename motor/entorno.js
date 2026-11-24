/* ============================================================
   ENTORNO — cielo, sol, sombras, césped, árboles, mar o montañas
   y la lluvia.
   Cada circuito tiene un "entorno": 'parque', 'costa' o 'montana'.
   Árboles 3D solo cerca de la pista; lo lejano es una banda de bosque
   con neblina (mucho más barata). Ajustes en config.js → graficos.
   Opciones visuales por circuito en circuitos.js → visual
   (sol, neblina, distanciaArboles, franjasCesped...). Sin "visual",
   todo queda como siempre.
   ============================================================ */

class Entorno {
  constructor(escena, trazado, constructor) {
    this.escena = escena;
    this.t = trazado;
    this.datos = trazado.datos;
    this.matPista = constructor.mat;
    this.colorAsfalto = constructor.colorAsfalto || "#9a9ea3";
    this.ocupado = constructor.ocupado || []; // tribunas y edificios: ahí no van árboles
    this.vis = this.datos.visual || {};
    this.grupo = new THREE.Group();
    this.grupo.name = 'entorno';
    this.rnd = Utils.semilla(this.datos.id.length * 31 + 7);
    escena.add(this.grupo);

    this.colorCieloArriba = new THREE.Color(this.datos.cielo.arriba);
    this.colorHorizonte = new THREE.Color(this.datos.cielo.horizonte);

    this._cielo();
    this._luces();
    this._suelo();
    this._arboles();
    this._skyline(); // (visual.skyline: ciudad en el horizonte)
    if (this.datos.entorno === 'costa') this._costa();
    if (this.datos.entorno === 'montana') this._montanas();
    this._lluvia();
  }

  // ---------- Cielo con degradado y halo del sol ----------
  _cielo() {
    const sol = this.vis.sol || {};
    this.dirSol = new THREE.Vector3(...(sol.direccion || [-0.45, 0.62, 0.35])).normalize(); // y pequeña = sol bajo
    this.intensidadSol = sol.intensidad ?? 2.8;
    this.nieblaCerca = this.vis.neblina?.cerca ?? 900;
    if (this.vis.neblina?.color) this.colorHorizonte.set(this.vis.neblina.color);
    this.uniformesCielo = {
      arriba: { value: this.colorCieloArriba.clone() },
      horizonte: { value: this.colorHorizonte.clone() },
      sol: { value: this.dirSol.clone() },
      intensidadSol: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniformesCielo,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 arriba; uniform vec3 horizonte; uniform vec3 sol; uniform float intensidadSol;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 c = mix(horizonte, arriba, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sol), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 350.0) * 2.5 + pow(s, 12.0) * 0.18) * intensidadSol; // (disco del sol algo mayor: que se vea)
          if (vDir.y < 0.0) c = horizonte * 0.9;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.cielo = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.graficos.distanciaVision * 0.95, 32, 16), mat);
    this.cielo.renderOrder = -1;
    this.grupo.add(this.cielo);
    this.escena.fog = new THREE.Fog(this.colorHorizonte.clone(), this.nieblaCerca, CONFIG.graficos.distanciaVision * 0.9);
  }

  // ---------- Luces ----------
  _luces() {
    // (visual.luzCalida: cielo algo más cálido y menos luz de relleno → sombras con más contraste, aspecto de "foto")
    this.hemi = this.vis.luzCalida ? new THREE.HemisphereLight('#e9eef7', '#5d5236', 0.85) : new THREE.HemisphereLight('#dbe9ff', '#4a5a33', 1.1);
    this.grupo.add(this.hemi);

    this.sol = new THREE.DirectionalLight(this.vis.sol?.color || (this.vis.luzCalida ? '#ffe6c2' : '#fff3df'), this.intensidadSol * (this.vis.luzCalida ? 1.15 : 1));
    this.sol.castShadow = CONFIG.graficos.sombras;
    const r = 2048; // (lo cambia aplicarCalidad según la calidad elegida)
    this.sol.shadow.mapSize.set(r, r);
    const c = this.sol.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 10; c.far = 600;
    this.sol.shadow.bias = -0.0004;
    this.sol.shadow.normalBias = 0.04;
    this.grupo.add(this.sol);
    this.grupo.add(this.sol.target);
  }

  // ---------- Césped ----------
  _suelo() {
    // (visual.sueloUrbano, Mónaco: pavimento gris de ciudad en vez de césped: fuera de la pista no hay hierba)
    const tex = this.vis.sueloUrbano ? Texturas.pavimento() : Texturas.cesped(this.datos.cesped, this.vis.franjasCesped);
    const caja = this.t.caja;
    const costa = this.datos.entorno === 'costa';
    // Con cuestas (Mónaco, Interlagos) la malla tiene que ser FINA (celdas de ~8 m): si cubre 16 km, las celdas
    // salen de 66 m y sus triángulos se cuelan por encima del asfalto (Interlagos: césped en medio de la pista).
    // Así que solo cubre el circuito y un margen; más allá, un plano liso por debajo hasta el horizonte (abajo)
    const ajustado = costa || this.t.conAltura, margen = costa ? 700 : 1400;
    const tamX = ajustado ? caja.maxX - caja.minX + margen : 16000;
    const tamZ = ajustado ? caja.maxZ - caja.minZ + margen : 16000;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(tamX / (this.vis.sueloUrbano ? 12 : 36), tamZ / (this.vis.sueloUrbano ? 12 : 36));
    // Circuito con cuestas (Mónaco): el suelo es una malla que sigue la altura de la pista más cercana
    // (Trazado.alturaXZ), un poco por debajo para que no asome por encima del asfalto
    let geoSuelo;
    if (this.t.conAltura) {
      const nX = Math.min(240, Math.ceil(tamX / 8)), nZ = Math.min(240, Math.ceil(tamZ / 8));
      geoSuelo = new THREE.PlaneGeometry(tamX, tamZ, nX, nZ);
      const pos = geoSuelo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        // (el plano se tumba: su "y" local acaba siendo −z en el mundo y su "z" local, la altura)
        pos.setZ(k, this.t.sueloXZ(caja.cx + pos.getX(k), caja.cz - pos.getY(k)));
      }
      geoSuelo.computeVertexNormals();
      geoSuelo.computeBoundingSphere(); geoSuelo.computeBoundingBox(); // (con las alturas nuevas: si no, se recorta mal al mirarlo)
    } else geoSuelo = new THREE.PlaneGeometry(tamX, tamZ);
    const suelo = new THREE.Mesh(geoSuelo, new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }));
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(caja.cx, this.t.conAltura ? 0 : -0.06, caja.cz);
    suelo.receiveShadow = true;
    this.suelo = suelo; // (en calidad Rendimiento no recibe sombras: sin sombras de árboles no hay nada que calcular en el césped)
    this.grupo.add(suelo);
    if (this.t.conAltura && !costa) { // plano lejano, por debajo del punto más bajo (hasta el horizonte)
      const tl = tex.clone(); tl.needsUpdate = true; tl.repeat.set(16000 / 36, 16000 / 36);
      const lejos = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ map: tl, roughness: 1 }));
      lejos.rotation.x = -Math.PI / 2;
      lejos.position.set(caja.cx, Math.min(...this.t.alt) - 1.5, caja.cz);
      this.grupo.add(lejos);
    }
  }

  // ---------- Árboles (con InstancedMesh para que vaya rápido) ----------
  // Solo CERCA de la pista (hasta graficos.distanciaMaxArboles): son los que se ven
  // bien. Lo lejano lo pinta la banda de bosque del horizonte (_bandaFondo).
  // Van repartidos en "trozos" por zonas del circuito: así la tarjeta gráfica se
  // salta los trozos que no están en pantalla (y en las sombras, los lejanos).
  _arboles() {
    const t = this.t, rnd = this.rnd, G = CONFIG.graficos;
    const pinos = this.datos.entorno === 'montana' || !!this.vis.pinos; // (visual.pinos: bosque de pinos sin montañas nevadas, Spa)
    const cantidad = Math.round(G.arboles * (this.datos.densidadArboles ?? 1));
    const dMin = this.vis.distanciaArboles ?? 72, dMax = Math.max(dMin + 25, G.distanciaMaxArboles);
    const pos = [];
    let intentos = 0;
    while (pos.length < cantidad && intentos < cantidad * 12) {
      intentos++;
      // Un punto al azar de la pista, a un lado y a una distancia entre dMin y dMax del eje
      const i = Math.floor(rnd() * t.N), lado = rnd() < 0.5 ? 1 : -1;
      const d = dMin + Math.pow(rnd(), 1.4) * (dMax - dMin); // más densos cerca
      const x = t.x[i] + t.nx[i] * lado * d, z = t.z[i] + t.nz[i] * lado * d;
      if (t.distanciaPista(x, z) < dMin || t.enPuerto(x, z)) continue; // pisa otra parte del circuito (o el agua del puerto)
      // (zonasArboles, Interlagos: solo donde los hay de verdad según el vídeo; fuera de ellas, casi ninguno)
      const ZA = this.datos.zonasArboles;
      if (ZA && !ZA.some((zz) => (!zz.lado || zz.lado === lado) && Utils.envolver(i * t.ds - zz.sIni, t.L) < Utils.envolver(zz.sFin - zz.sIni, t.L)) && (d < 170 || rnd() > 0.25)) continue; // (fuera de ellas, solo alguno lejos, de fondo)
      if (this.ocupado.some(([ox, oz, r]) => (x - ox) ** 2 + (z - oz) ** 2 < r * r)) continue;
      // (visual.escalaArboles: árboles más grandes. Spa: los abetos de las Ardenas miden 25-30 m y tapan el cielo)
      pos.push([x, z, (0.75 + rnd() * 0.75) * (this.vis.escalaArboles ?? 1), i]);
    }

    const tronco = new THREE.CylinderGeometry(0.25, 0.4, 4, 6);
    tronco.translate(0, 2, 0);
    let copa, copaLejos;
    if (pinos) {
      copa = new THREE.ConeGeometry(3, 11, 8);
      copa.translate(0, 9, 0);
      copaLejos = new THREE.ConeGeometry(3, 11, 5).translate(0, 9, 0);
    } else {
      // Copa de dos "bolas" (algo más natural que una sola)
      const a = new THREE.IcosahedronGeometry(4.2, 1).translate(0, 7.5, 0);
      const b = new THREE.IcosahedronGeometry(3, 1).translate(1.6, 10, 0.8);
      copa = this._unir([a, b]);
      // Versión lejana: las mismas dos bolas con 4 veces menos caras
      copaLejos = this._unir([new THREE.IcosahedronGeometry(4.2, 0).translate(0, 7.5, 0), new THREE.IcosahedronGeometry(3, 0).translate(1.6, 10, 0.8)]);
    }
    const matTronco = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 });
    const matCopa = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    // (visual.coloresArboles: verdes propios del circuito. Catalunya: pino y encina, verde oliva apagado)
    const verdes = this.vis.coloresArboles || (pinos ? ['#2f5a33', '#29502e', '#3a6b3c', '#24452a'] : ['#3f7a35', '#4c8a3c', '#356b2e', '#5b9444', '#6e8f3a', '#2f6230']);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), p = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0), color = new THREE.Color();

    // Trozos: ~20 zonas a lo largo del circuito
    const trozos = 20, grupos = Array.from({ length: trozos }, () => []);
    this.copas = []; // (para quitarles la sombra en calidad Rendimiento)
    this.trozosArboles = []; // cada trozo cambia entre la copa detallada y la sencilla según lo cerca que esté
    for (const a of pos) grupos[Math.floor((a[3] / t.N) * trozos) % trozos].push(a);
    for (const lista of grupos) {
      if (!lista.length) continue;
      const mTronco = new THREE.InstancedMesh(tronco, matTronco, lista.length);
      const mCopa = new THREE.InstancedMesh(copa, matCopa, lista.length);
      lista.forEach(([x, z, s], k) => {
        q.setFromAxisAngle(eje, rnd() * Math.PI * 2);
        e.set(s, s * (0.85 + rnd() * 0.4), s);
        m.compose(p.set(x, t.alturaXZ(x, z), z), q, e);
        mTronco.setMatrixAt(k, m);
        mCopa.setMatrixAt(k, m);
        mCopa.setColorAt(k, color.set(verdes[Math.floor(rnd() * verdes.length)]));
      });
      // Esfera que envuelve el trozo: para saltárselo si no se ve
      mTronco.computeBoundingSphere();
      mCopa.computeBoundingSphere();
      mCopa.castShadow = true;
      this.copas.push(mCopa);
      mCopa.geometry = copaLejos; // (empieza en la versión sencilla: _detalleArboles la cambia si está cerca)
      this.trozosArboles.push({ copa: mCopa, cerca: copa, lejos: copaLejos, centro: mCopa.boundingSphere.center.clone(), radio: mCopa.boundingSphere.radius, detalle: false });
      this.grupo.add(mTronco, mCopa);
    }
    if (G.bandaFondo && this.datos.entorno !== 'costa' && !this.vis.skyline) this._bandaFondo(pinos); // (con ciudad en el horizonte, sin la banda de bosque)
  }

  // Une varias geometrías en una (para la copa de los árboles)
  _unir(geos) {
    const pos = [], nor = [];
    for (const g of geos) {
      const ng = g.index ? g.toNonIndexed() : g;
      pos.push(...ng.attributes.position.array);
      nor.push(...ng.attributes.normal.array);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return r;
  }

  // ---------- Banda de bosque en el horizonte ----------
  // Un anillo alrededor del circuito con siluetas de árboles oscuros que se
  // funden con la neblina: da sensación de bosque infinito por casi nada (1 malla).
  // Ciudad en el horizonte (Interlagos: los rascacielos de São Paulo se ven desde casi todo el circuito).
  // Torres blancas y beige con ventanas, en un anillo entre "desde" y "hasta" metros del centro del circuito
  _skyline() {
    const S = this.vis.skyline;
    if (!S) return;
    if (S.estilo === 'saopaulo') return this._skylineSaoPaulo(S);
    const t = this.t, rnd = this.rnd, caja = t.caja;
    const ventanas = Texturas._crear('ventanasTorre', 64, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 12) for (let x = 5; x < w; x += 12) { g.fillStyle = rnd() < 0.35 ? '#a9c4d6' : '#6f8796'; g.fillRect(x, y, 7, 7); }
    });
    ventanas.wrapS = ventanas.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const colores = ['#f4f1ea', '#e9e2d4', '#dcdfe3', '#f2e6d2', '#ffffff', '#d8d2c8'];
    const lista = [], suelo = Math.min(...t.alt) - 1;
    for (let k = 0; k < S.cantidad * 6 && lista.length < S.cantidad; k++) {
      const ang = rnd() * Math.PI * 2, r = S.desde + Math.pow(rnd(), 0.8) * (S.hasta - S.desde);
      const x = caja.cx + Math.cos(ang) * r, z = caja.cz + Math.sin(ang) * r;
      if (t.distanciaPista(x, z) < S.desde * 0.6) continue;
      const alto = S.alto[0] + Math.pow(rnd(), 1.6) * (S.alto[1] - S.alto[0]);
      lista.push([x, z, alto, 16 + rnd() * 18, 16 + rnd() * 18, ang]);
    }
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: ventanas, roughness: 0.85 }), lista.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    lista.forEach(([x, z, alto, an, fo, ang], k) => {
      q.setFromEuler(e.set(0, ang, 0));
      m.compose(new THREE.Vector3(x, suelo, z), q, new THREE.Vector3(an, alto, fo));
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, col.set(colores[k % colores.length]));
    });
    inst.frustumCulled = false; // (rodean todo el circuito)
    this.grupo.add(inst);
  }

  // São Paulo vista desde Interlagos (visual.skyline.estilo: 'saopaulo'; vídeo 10,5 s, 24 s y 58 s): no son torres
  // sueltas sino BARRIOS de torres de viviendas (15-30 pisos, finas, blancas, crema, gris claro y salmón, con el
  // cuarto de máquinas en lo alto) muy juntas, y entre medias casas bajas de tejado rojizo. Alguna torre de cristal.
  // Todo va en UNA malla (una sola llamada de dibujo) y en calidad Rendimiento se pone la mitad.
  _skylineSaoPaulo(S) {
    const t = this.t, rnd = this.rnd, caja = t.caja, suelo = Math.min(...t.alt) - 1;
    const f = CONFIG.graficos.calidad === 'rendimiento' ? 0.5 : 1;
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const c0 = new THREE.Color();
    // Caja con ventanas por metros (uv: 16 m de ancho y 12 m = 4 pisos por repetición); techo liso
    const bloque = (x, z, an, fo, y0, alto, ang, color, ventanas) => {
      const cs = Math.cos(ang), sn = Math.sin(ang), hx = an / 2, hz = fo / 2;
      const P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
      const esq = [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)], largos = [an, fo, an, fo];
      c0.set(color);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = esq[k], [bx, bz] = esq[(k + 1) % 4], l = Math.hypot(bx - ax, bz - az) || 1;
        let nx = bz - az, nz = -(bx - ax); if (nx * ((ax + bx) / 2 - x) + nz * ((az + bz) / 2 - z) < 0) { nx = -nx; nz = -nz; } // (hacia fuera)
        const base = pos.length / 3, u1 = ventanas ? largos[k] / 16 : 0.01, v1 = ventanas ? alto / 12 : 0.99, v0 = ventanas ? 0 : 0.99;
        for (const [px, py, pz, u, v] of [[ax, y0, az, 0, v0], [bx, y0, bz, u1, v0], [bx, y0 + alto, bz, u1, v1], [ax, y0 + alto, az, 0, v1]]) {
          pos.push(px, py, pz); nor.push(nx / l, 0, nz / l); uv.push(ventanas ? u : 0.01, ventanas ? v : 0.99); col.push(c0.r, c0.g, c0.b);
        }
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      const base = pos.length / 3; c0.multiplyScalar(0.82); // techo, algo más oscuro
      for (const [px, pz] of esq) { pos.push(px, y0 + alto, pz); nor.push(0, 1, 0); uv.push(0.01, 0.99); col.push(c0.r, c0.g, c0.b); }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    const coloresTorre = ['#f3efe6', '#e8e0d0', '#dcd6cc', '#efe3cf', '#d9dde0', '#e6d3c3', '#c9ccd0', '#f7f5f0', '#e9d9c4', '#d6c7b8'];
    const coloresCasa = ['#b8644a', '#c47a52', '#a9583f', '#d8cbb5', '#c9b79c', '#e2dccf', '#9c5a46'];
    const lejos = (x, z) => t.distanciaPista(x, z) > S.desde * 0.6;
    const grupos = Math.round((S.grupos ?? 26) * f), porGrupo = Math.round(S.cantidad / (S.grupos ?? 26));
    for (let g = 0; g < grupos; g++) {
      const ang = rnd() * Math.PI * 2, r = S.desde + Math.pow(rnd(), 0.7) * (S.hasta - S.desde);
      const gx = caja.cx + Math.cos(ang) * r, gz = caja.cz + Math.sin(ang) * r, radio = 90 + rnd() * 160;
      const altoGrupo = 0.6 + rnd() * 0.6; // barrios más altos y más bajos
      for (let k = 0; k < porGrupo; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * radio, x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
        if (!lejos(x, z)) continue;
        const alto = (S.alto[0] + Math.pow(rnd(), 2.2) * (S.alto[1] - S.alto[0])) * altoGrupo;
        const vidrio = rnd() < 0.06, an = 14 + rnd() * 10, fo = 14 + rnd() * 12, giro = ang + (rnd() < 0.5 ? 0 : Math.PI / 4);
        bloque(x, z, an, fo, suelo, alto, giro, vidrio ? '#6f8496' : coloresTorre[Math.floor(rnd() * coloresTorre.length)], true);
        bloque(x, z, an * 0.45, fo * 0.4, suelo + alto, 3 + rnd() * 3, giro, '#9a9c9e', false); // cuarto de máquinas / depósito
      }
      for (let k = 0; k < porGrupo * 1.2; k++) { // casas bajas alrededor
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * radio * 1.6, x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
        if (!lejos(x, z)) continue;
        bloque(x, z, 14 + rnd() * 20, 12 + rnd() * 18, suelo, 5 + rnd() * 9, rnd() * Math.PI, coloresCasa[Math.floor(rnd() * coloresCasa.length)], false);
      }
    }
    // Las torres altas aisladas que se ven detrás de la Junção (vídeo 58-60 s): S.torres = [{ s, lado, dist, alto }]
    for (const T of S.torres || []) {
      const i = t.indice(T.s), x = t.x[i] + t.nx[i] * T.lado * T.dist, z = t.z[i] + t.nz[i] * T.lado * T.dist;
      bloque(x, z, 18, 22, suelo, T.alto, this.rnd() * Math.PI, T.color || '#4f5d6b', true);
      bloque(x, z, 8, 9, suelo + T.alto, 5, 0, '#8a8d90', false);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const tex = Texturas.ventanasResidencial();
    const malla = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    malla.frustumCulled = false; // (rodean todo el circuito)
    this.grupo.add(malla);
  }

  _bandaFondo(pinos) {
    const caja = this.t.caja;
    const radio = Math.hypot(caja.maxX - caja.minX, caja.maxZ - caja.minZ) / 2 + 420;
    const alto = pinos ? 70 : 55;
    // (visual.colorBosque: [base, mezcla] de las colinas del fondo. Catalunya: monte bajo mediterráneo, verde oliva seco)
    const colorBosque = this.vis.colorBosque?.[0] || (pinos ? '#1d3322' : '#24391f'), colorMezcla = this.vis.colorBosque?.[1] || '#2c4526';
    const tex = Texturas._crear('bandaFondo' + pinos + colorBosque, 1024, 128, (g, w, h) => {
      // Siluetas de copas (redondas o pinos) con la base sólida
      g.clearRect(0, 0, w, h);
      g.fillStyle = colorBosque;
      g.fillRect(0, h * 0.62, w, h * 0.38);
      for (let x = -20; x < w + 20; x += 7 + Math.random() * 9) {
        const ancho = 14 + Math.random() * 22, altura = h * (0.25 + Math.random() * 0.35);
        g.fillStyle = Math.random() < 0.5 ? colorBosque : colorMezcla;
        g.beginPath();
        if (pinos) { g.moveTo(x - ancho / 2, h * 0.7); g.lineTo(x, h * 0.7 - altura * 1.3); g.lineTo(x + ancho / 2, h * 0.7); }
        else g.ellipse(x, h * 0.7 - altura * 0.45, ancho / 2, altura / 2, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.round((2 * Math.PI * radio) / 260), 1); // un "tramo" de textura cada ~260 m
    const geo = new THREE.CylinderGeometry(radio, radio, alto, 96, 1, true);
    geo.translate(0, alto / 2 - 2, 0);
    // Sin transparencia: con alphaTest basta (se pinta como un objeto opaco, sin mezclar píxeles)
    const banda = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.35, side: THREE.BackSide, fog: true }));
    banda.position.set(caja.cx, 0, caja.cz);
    banda.renderOrder = 0;
    this.grupo.add(banda);
  }

  // ---------- Costa: mar y edificios ----------
  _costa() {
    const caja = this.t.caja, rnd = this.rnd;
    const mar = new THREE.Mesh(
      new THREE.PlaneGeometry(20000, 20000),
      new THREE.MeshStandardMaterial({ color: '#1d6a96', roughness: 0.18, metalness: 0.35 })
    );
    mar.rotation.x = -Math.PI / 2;
    mar.position.set(caja.cx, -0.6, caja.cz);
    // El mar parecía "moverse" con la cámara: a 1-2 km, 0,6 m de separación con el césped es menos que la
    // precisión de profundidad y los dos planos se peleaban (z-fighting) de forma distinta en cada fotograma.
    // Solución: el mar se pinta el primero (justo después del cielo) y sin escribir profundidad, así
    // el césped, la pista y todo lo demás quedan siempre encima, sin pelearse.
    mar.renderOrder = -0.5;
    mar.material.depthWrite = false;
    mar.frustumCulled = false;
    this.grupo.add(mar);
    this.mar = mar;

    // Edificios de la ciudad alrededor del circuito (sin pisar la pista)
    const ventanas = Texturas._crear('ventanas', 128, 256, (g, w, h) => {
      g.fillStyle = '#e8e2d6';
      g.fillRect(0, 0, w, h);
      for (let y = 8; y < h; y += 22) for (let x = 8; x < w; x += 20) {
        g.fillStyle = Math.random() < 0.3 ? '#9cc3dc' : '#4d6a80';
        g.fillRect(x, y, 12, 14);
      }
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const colores = ['#f2e8d5', '#f7d6bf', '#e3eef2', '#fff3c4', '#e8d9f0', '#ffffff'];
    const lista = [];
    for (let k = 0; k < 900 && lista.length < 260; k++) {
      const x = caja.minX - 180 + rnd() * (caja.maxX - caja.minX + 360);
      const z = caja.minZ - 180 + rnd() * (caja.maxZ - caja.minZ + 360);
      if (this.t.distanciaPista(x, z) < 85 || this.t.enPuerto(x, z)) continue; // (ni en la pista ni en el agua del puerto)
      lista.push([x, z, 12 + rnd() * 40, 14 + rnd() * 18, 14 + rnd() * 18]);
    }
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: ventanas, roughness: 0.8 }), lista.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    lista.forEach(([x, z, h, a, b], i) => {
      m.compose(new THREE.Vector3(x, this.t.alturaXZ(x, z) - 1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.3), new THREE.Vector3(a, h, b));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.set(colores[Math.floor(rnd() * colores.length)]));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.grupo.add(inst);
    for (const P of this.t.zonasAgua) this._puerto(P); // (Mónaco: el puerto y el mar de Portier)
  }

  // ---------- Puerto (Mónaco: Port Hercule, del túnel al Tabac; ver circuitos.js → puerto) ----------
  // Agua del puerto (por encima del fondo, que trazado.sueloXZ hunde ahí) y yates blancos amarrados en
  // filas, como en el vídeo onboard (referencias/monaco_2010_notas.md, 59-68 s)
  _puerto(P) {
    const t = this.t, rnd = this.rnd, muroL = P.lado > 0 ? t.muroIzq : t.muroDer;
    const c = t.cajaAgua(P);
    // Agua SOLO en las casillas (de 10 m) que son agua de verdad: antes era un rectángulo enorme que, fuera del
    // puerto, quedaba a la misma altura que el suelo y los dos se "peleaban" (parpadeo: el agua parecía moverse)
    const C = 10, v = [];
    for (let x = c.x0; x < c.x1; x += C) for (let z = c.z0; z < c.z1; z += C) {
      if (!t.enPuerto(x + C / 2, z + C / 2, P)) continue;
      const y = P.nivel, a = x - 1, b = z - 1, A = x + C + 1, B = z + C + 1; // (1 m de solape: sin rendijas)
      v.push(a, y, b, a, y, B, A, y, B, a, y, b, A, y, B, A, y, b);
    }
    const geoAgua = new THREE.BufferGeometry();
    geoAgua.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geoAgua.computeVertexNormals();
    const agua = new THREE.Mesh(geoAgua, new THREE.MeshStandardMaterial({ color: P.colorAgua || '#2a6f8f', roughness: 0.12, metalness: 0.4, side: THREE.DoubleSide }));
    agua.receiveShadow = true;
    this.grupo.add(agua);
    // Barcos: 3 diseños hechos con piezas curvas (ver _disenosBarcos): yate de motor de 2-3 cubiertas, velero
    // con mástil y botavara, y lancha con parabrisas. Cada diseño se dibuja con una malla instanciada por pieza.
    // Amarrados con la popa hacia el muelle (así se amarra en Mónaco), en filas perpendiculares a él
    const D = this._disenos || (this._disenos = this._disenosBarcos());
    const barcos = { yate: [], velero: [], lancha: [], yateAzul: [] };
    const puestos = [];
    for (let k = 0; k < 3000 && puestos.length < (P.yates ?? 90); k++) {
      const s = P.sIni + rnd() * (P.sFin - P.sIni), i = t.indice(s);
      const d = (muroL[i] + 14) + rnd() * (P.ancho * 0.6);
      const x = t.x[i] + t.nx[i] * P.lado * d, z = t.z[i] + t.nz[i] * P.lado * d;
      const r = rnd(), tipo = r < 0.5 ? 'yate' : r < 0.62 ? 'yateAzul' : r < 0.82 ? 'velero' : 'lancha';
      const L = tipo.startsWith('yate') ? 18 + rnd() * 30 : tipo === 'velero' ? 10 + rnd() * 9 : 8 + rnd() * 5;
      if (!t.enPuerto(x, z, P) || !t.enPuerto(x + t.nx[i] * L / 2, z + t.nz[i] * L / 2, P) || !t.enPuerto(x - t.nx[i] * L / 2, z - t.nz[i] * L / 2, P)) continue;
      if (puestos.some((y) => Math.hypot(y.x - x, y.z - z) < (y.L + L) * 0.3)) continue; // (sin pisarse)
      const ang = Math.atan2(t.nx[i] * P.lado, t.nz[i] * P.lado) + (rnd() - 0.5) * 0.12; // proa hacia fuera del muelle
      const b = { x, z, L, ang };
      puestos.push(b); barcos[tipo].push(b);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), esc = new THREE.Vector3(), pos = new THREE.Vector3();
    for (const tipo in barcos) {
      const lista = barcos[tipo];
      if (!lista.length) continue;
      for (const pieza of D[tipo]) {
        const inst = new THREE.InstancedMesh(pieza.geo, pieza.mat, lista.length);
        lista.forEach((b, j) => { m.compose(pos.set(b.x, P.nivel, b.z), q.setFromAxisAngle(eje, b.ang), esc.set(b.L, b.L, b.L)); inst.setMatrixAt(j, m); });
        inst.castShadow = pieza.sombra !== false; inst.receiveShadow = true;
        this.grupo.add(inst);
      }
    }
  }

  // Los 3 diseños de barco, en unidades de ESLORA (largo = 1, proa hacia +z, línea de flotación en y = 0).
  // Cada uno: lista de { geo, mat }. El casco es una superficie curva hecha por secciones (_casco)
  _disenosBarcos() {
    const mat = (color, rug = 0.35, met = 0) => new THREE.MeshStandardMaterial({ color, roughness: rug, metalness: met, side: THREE.DoubleSide });
    const blanco = mat('#f7f9fb'), cristal = mat('#1f2a33', 0.1, 0.4), teca = mat('#a87a4f', 0.8), gris = mat('#c9ced4', 0.4, 0.3), azul = mat('#1c2f52', 0.3);
    // Planta con el frente redondeado (para las cubiertas): largo × ancho, de altura h, desde y0, centrada en z0
    const cubierta = (largo, ancho, h, y0, z0, redondeo = 0.5) => {
      const f = new THREE.Shape(), a = ancho / 2, l = largo / 2;
      f.moveTo(-a, -l); f.lineTo(a, -l); f.lineTo(a, l - largo * 0.25 * redondeo);
      f.quadraticCurveTo(a * 0.9, l, 0, l); f.quadraticCurveTo(-a * 0.9, l, -a, l - largo * 0.25 * redondeo); f.lineTo(-a, -l);
      const g = new THREE.ExtrudeGeometry(f, { depth: h, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); g.translate(0, y0, z0); // (tumbada y girada media vuelta: proa hacia +z, sin invertir las caras)
      return g;
    };
    const cilindro = (r0, r1, h, x, y, z, rx = 0) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6); g.rotateX(rx); g.translate(x, y, z); return g; };
    // Yate de motor: casco alto, 2 cubiertas con ventanas corridas y un arco de radar
    const yate = (colorCasco) => [
      { geo: this._casco(0.24, 0.085, 0.75), mat: colorCasco },
      { geo: cubierta(0.62, 0.2, 0.012, 0.085, -0.05, 0.3), mat: teca },             // cubierta de teca
      { geo: cubierta(0.5, 0.17, 0.05, 0.095, -0.04, 0.9), mat: blanco },             // primera cubierta
      { geo: cubierta(0.5, 0.175, 0.022, 0.11, -0.035, 0.9), mat: cristal },        // ventanas corridas
      { geo: cubierta(0.34, 0.15, 0.045, 0.145, -0.07, 1), mat: blanco },             // segunda cubierta (puente)
      { geo: cubierta(0.3, 0.155, 0.018, 0.16, -0.065, 1), mat: cristal },
      { geo: cubierta(0.08, 0.1, 0.05, 0.19, -0.1, 0.2), mat: gris },               // arco del radar
    ];
    return {
      yate: yate(blanco),
      yateAzul: yate(azul), // (algunos con el casco azul marino, como en las fotos del puerto)
      velero: [
        { geo: this._casco(0.2, 0.06, 0.9), mat: blanco },
        { geo: cubierta(0.3, 0.12, 0.035, 0.058, -0.02, 0.8), mat: blanco },           // camarote bajo
        { geo: cubierta(0.3, 0.125, 0.012, 0.072, -0.02, 0.8), mat: cristal },
        { geo: cilindro(0.006, 0.009, 1.3, 0, 0.72, 0.05), mat: gris },                  // mástil
        { geo: cilindro(0.005, 0.005, 0.42, 0, 0.2, -0.16, Math.PI / 2), mat: gris },    // botavara
        { geo: cilindro(0.014, 0.014, 0.4, 0, 0.215, -0.16, Math.PI / 2), mat: azul },   // vela recogida (funda azul)
      ],
      lancha: [
        { geo: this._casco(0.3, 0.07, 0.6), mat: blanco },
        { geo: cubierta(0.35, 0.24, 0.006, 0.062, -0.15, 0.2), mat: teca },             // bañera
        { geo: cubierta(0.06, 0.26, 0.06, 0.068, 0.06, 1), mat: cristal },               // parabrisas
        { geo: cubierta(0.3, 0.2, 0.012, 0.068, 0.22, 1), mat: blanco },               // cubierta de proa
      ],
    };
  }

  // Casco curvo: secciones en V de popa (z = −0,5, espejo recto) a proa (z = +0,5, en punta), con la cubierta
  // subiendo hacia la proa (arrufo). ancho/alto relativos a la eslora; "lleno" = hasta dónde va ancho (0-1)
  _casco(ancho, alto, lleno) {
    const N = 16, S = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N, z = u - 0.5;
      const t = u < lleno ? 1 : Math.pow(Math.cos(((u - lleno) / (1 - lleno)) * Math.PI / 2), 0.7); // se estrecha hacia la proa
      const w = (ancho / 2) * Math.max(t, 0.002), hd = alto * (1 + 0.45 * u * u);
      const quilla = -alto * 0.4 * (u < 0.85 ? 1 : (1 - u) / 0.15);
      S.push([[-w, hd, z], [-w * 0.95, alto * 0.25, z], [-w * 0.5, -alto * 0.25, z], [0, quilla, z], [w * 0.5, -alto * 0.25, z], [w * 0.95, alto * 0.25, z], [w, hd, z]]);
    }
    const v = [], tri = (a, b, c) => v.push(...a, ...b, ...c);
    for (let k = 0; k < N; k++) {
      const A = S[k], B = S[k + 1];
      for (let j = 0; j < 6; j++) { tri(A[j], B[j], B[j + 1]); tri(A[j], B[j + 1], A[j + 1]); } // costados y fondo
      tri(A[0], A[6], B[6]); tri(A[0], B[6], B[0]); // cubierta
    }
    const P0 = S[0];
    for (let j = 1; j < 6; j++) tri(P0[0], P0[j], P0[j + 1]); // espejo de popa
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }

  // ---------- Montañas en el horizonte ----------
  _montanas() {
    const caja = this.t.caja, rnd = this.rnd;
    const roca = new THREE.MeshStandardMaterial({ color: '#5d6b5a', roughness: 1, flatShading: true });
    const nieve = new THREE.MeshStandardMaterial({ color: '#f4f7fa', roughness: 0.8, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const d = 3000 + rnd() * 1600;
      const alto = 500 + rnd() * 900, radio = 700 + rnd() * 700;
      const monte = new THREE.Mesh(new THREE.ConeGeometry(radio, alto, 7, 1), roca);
      monte.position.set(caja.cx + Math.cos(ang) * d, alto / 2 - 20, caja.cz + Math.sin(ang) * d);
      monte.rotation.y = rnd() * 3;
      this.grupo.add(monte);
      if (alto > 900) {
        const pico = new THREE.Mesh(new THREE.ConeGeometry(radio * 0.3, alto * 0.3, 7, 1), nieve);
        pico.position.set(monte.position.x, alto - alto * 0.15 - 20 + 1, monte.position.z);
        pico.rotation.y = monte.rotation.y;
        this.grupo.add(pico);
      }
    }
  }

  // ---------- Lluvia: líneas que caen alrededor de la cámara ----------
  _lluvia() {
    const n = 4000;
    const pos = new Float32Array(n * 6);
    this.gotas = [];
    for (let i = 0; i < n; i++) {
      this.gotas.push([Utils.aleatorio(-70, 70), Utils.aleatorio(0, 50), Utils.aleatorio(-70, 70)]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lluvia = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d2e0', transparent: true, opacity: 0.45 }));
    this.lluvia.frustumCulled = false;
    this.lluvia.visible = false;
    this.grupo.add(this.lluvia);
  }

  // Copas detalladas solo en los trozos de bosque cerca de la cámara (distancia
  // "efectiva": con el zoom de la cámara de TV lo lejano se ve grande)
  _detalleArboles(camara) {
    const k = Math.tan((camara.fov * Math.PI) / 360) / Math.tan((25 * Math.PI) / 180);
    const lim = CONFIG.graficos.distanciaDetalleArboles, p = camara.position;
    for (const t of this.trozosArboles || []) {
      const d = Math.max(0, Math.hypot(p.x - t.centro.x, p.z - t.centro.z) - t.radio) * k;
      const detalle = d < lim;
      if (detalle !== t.detalle) { t.detalle = detalle; t.copa.geometry = detalle ? t.cerca : t.lejos; }
    }
  }

  // ---------- Calidad gráfica (config.js → graficos.calidades) ----------
  // Tamaño del mapa de sombras y si los árboles proyectan sombra
  aplicarCalidad(q) {
    const r = q.resolucionSombras;
    if (this.sol.shadow.mapSize.x !== r) {
      this.sol.shadow.mapSize.set(r, r);
      if (this.sol.shadow.map) { this.sol.shadow.map.dispose(); this.sol.shadow.map = null; } // se rehace con el tamaño nuevo
    }
    for (const c of this.copas || []) c.castShadow = q.sombrasArboles;
    if (this.suelo && this.suelo.receiveShadow !== q.sombrasArboles) { this.suelo.receiveShadow = q.sombrasArboles; this.suelo.material.needsUpdate = true; }
  }

  // ---------- Cada fotograma ----------
  // foco: posición (THREE.Vector3) del coche que mira la cámara
  actualizar(dt, camara, foco, clima) {
    // La sombra solo se calcula cerca del coche enfocado (más calidad, menos coste)
    this.sol.target.position.copy(foco);
    this.sol.position.copy(foco).addScaledVector(this.dirSol, 250);
    this.cielo.position.copy(camara.position);
    this._detalleArboles(camara);

    // Tiempo: nubes y pista mojada
    const nubes = Utils.limitar(clima.lluvia * 1.6 + clima.nubes, 0, 1);
    const gris = this._gris || (this._gris = new THREE.Color('#6b737c'));
    const grisH = this._grisH || (this._grisH = new THREE.Color('#a3aab2'));
    this.uniformesCielo.arriba.value.copy(this.colorCieloArriba).lerp(gris, nubes);
    this.uniformesCielo.horizonte.value.copy(this.colorHorizonte).lerp(grisH, nubes);
    this.uniformesCielo.intensidadSol.value = 1 - nubes;
    this.escena.fog.color.copy(this.uniformesCielo.horizonte.value);
    this.escena.fog.far = CONFIG.graficos.distanciaVision * (0.9 - nubes * 0.45);
    this.escena.fog.near = this.nieblaCerca * (1 - nubes * 7 / 9); // (900 → 200 con nubes, como antes)
    this.sol.intensity = this.intensidadSol * (1 - nubes * 0.75);
    this.hemi.intensity = 1.1 * (1 - nubes * 0.3);

    const h = clima.humedad;
    if (h !== this._hAnterior) { // la pista mojada solo cambia cuando cambia la humedad
      this._hAnterior = h;
      const a = this.matPista.asfalto;
      a.roughness = 0.92 - h * 0.6;
      a.metalness = h * 0.25;
      a.color.set(this.colorAsfalto).multiplyScalar(1 - h * 0.45);
    }

    // Gotas de lluvia
    this.lluvia.visible = clima.lluvia > 0.02;
    if (this.lluvia.visible) {
      const p = this.lluvia.geometry.attributes.position.array;
      const n = Math.floor(this.gotas.length * Math.min(1, clima.lluvia * 1.3));
      const caida = 32 * dt;
      const cx = camara.position.x, cy = camara.position.y - 20, cz = camara.position.z;
      for (let i = 0; i < this.gotas.length; i++) {
        const g = this.gotas[i];
        g[1] -= caida;
        if (g[1] < 0) g[1] += 50;
        const o = i * 6;
        if (i < n) {
          p[o] = cx + g[0]; p[o + 1] = cy + g[1]; p[o + 2] = cz + g[2];
          p[o + 3] = cx + g[0] + 0.05; p[o + 4] = cy + g[1] - 0.9; p[o + 5] = cz + g[2];
        } else {
          p[o + 1] = p[o + 4] = -1000;
        }
      }
      this.lluvia.geometry.attributes.position.needsUpdate = true;
    }
  }
}
