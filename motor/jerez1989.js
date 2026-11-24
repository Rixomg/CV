/* ============================================================
   (24-11) JEREZ COMO EN LA ONBOARD DE 1989
   ------------------------------------------------------------
   Decorado que el motor de Box Box no trae y que se ve en la onboard:
   - lomas bajas alrededor, de hierba seca ocre con matas oscuras
   - una antena en lo alto de una loma y casas blancas al fondo
   - muretes blancos y negros en las curvas
   - pancartas amarillas grandes sobre postes y un cartel blanco bajo
   - caravanas y camiones blancos detrás del muro del paddock
   Todo lo ajustable está en Jerez1989.AJUSTES.
   ============================================================ */

const Jerez1989 = {
  AJUSTES: {
    lomas: { radioDesde: 40, ancho: 2400, alturaMin: 45, alturaMax: 190, subida: 260, repeticionTextura: 140 }, // (m) radioDesde: hueco desde la pista; subida: metros en que la loma llega a su altura
    casas: 60,                     // casas blancas sueltas al pie de las lomas
    antena: { angulo: 2.3, distancia: 500, alto: 55 },
    murete: { curvatura: 1 / 140, largo: 2, alto: 0.9 }, // muretes en las curvas más cerradas que este radio
    // Pancartas sobre postes: s = metros desde la meta, lado 1 = izquierda, marca = visual.publicidad
    pancartas: [
      { s: 40, lado: -1, marca: 1, ancho: 34, alto: 4, elevacion: 12, dist: 30 },  // la de la recta (fotograma 4 s), sobre la tribuna
      { s: 75, lado: 1, marca: 2, ancho: 12, alto: 2.6, elevacion: 0.6, dist: 9 }, // cartel blanco bajo
      { s: 1330, lado: 1, marca: 1, ancho: 22, alto: 3, elevacion: 3, dist: 30 },
      { s: 2050, lado: -1, marca: 1, ancho: 22, alto: 3, elevacion: 3, dist: 35 },
      { s: 2980, lado: 1, marca: 3, ancho: 22, alto: 3, elevacion: 3, dist: 30 },
      { s: 3640, lado: -1, marca: 1, ancho: 22, alto: 3, elevacion: 3, dist: 30 },
    ],
    caravanas: { sIni: -300, sFin: 120, lado: 1, dist: 105, cada: 14 },
  },

  decorar(escena, t, pista, movil) {
    const A = this.AJUSTES, g = new THREE.Group();
    g.name = 'jerez1989';
    const rnd = Utils.semilla(1989);
    const c = t.caja, cx = c.cx, cz = c.cz;
    const radioPista = Math.hypot(c.maxX - c.minX, c.maxZ - c.minZ) / 2;
    // (24-11) ¿está (x, z) lejos de TODA la pista? Así nada del decorado cae encima de otro tramo (las caravanas
    // del paddock acababan sobre la recta que va a Lorenzo y el coche las atravesaba)
    const libre = (x, z, margen) => t.distanciaPista(x, z) > t.hw + margen;

    // ---------- Lomas ----------
    // Anillo de terreno alrededor del circuito; la altura sube con la distancia y ondula con el ángulo
    const L = A.lomas, R0 = radioPista + L.radioDesde, R1 = R0 + L.ancho;
    const fases = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
    const altura = (ang, r) => {
      const sube = Utils.limitar((r - R0) / L.subida, 0, 1);
      const ola = 0.5 + 0.22 * Math.sin(ang * 3 + fases[0]) + 0.16 * Math.sin(ang * 7 + fases[1]) + 0.12 * Math.sin(ang * 13 + fases[2])
        + 0.08 * Math.sin(r / 260 + ang * 5 + fases[3]);
      return sube * sube * (3 - 2 * sube) * (L.alturaMin + (L.alturaMax - L.alturaMin) * Utils.limitar(ola, 0, 1)) - 0.4;
    };
    const nA = movil ? 96 : 160, nR = movil ? 12 : 18;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nR; j++) {
      const r = R0 + (R1 - R0) * (j / nR) ** 1.4; // más filas cerca, donde se ve el detalle
      for (let i = 0; i <= nA; i++) {
        const a = (i / nA) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        pos.push(x, altura(a, r), z);
        uv.push(x / L.repeticionTextura, z / L.repeticionTextura);
      }
    }
    for (let j = 0; j < nR; j++) for (let i = 0; i < nA; i++) {
      const a = j * (nA + 1) + i, b = a + nA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const lomas = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this._texturaLoma() }));
    lomas.receiveShadow = false;
    g.add(lomas);
    const sobreLoma = (x, z) => { const dx = x - cx, dz = z - cz; return altura(Math.atan2(dz, dx), Math.hypot(dx, dz)); };

    // ---------- Antena en lo alto de una loma (fotograma 52 s) ----------
    {
      const an = A.antena, r = R0 + an.distancia, x = cx + Math.cos(an.angulo) * r, z = cz + Math.sin(an.angulo) * r, y = sobreLoma(x, z);
      const gris = new THREE.MeshLambertMaterial({ color: '#c9ccd2' });
      const fuste = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, an.alto, 6), gris);
      fuste.position.set(x, y + an.alto / 2, z);
      const caseta = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 5, 8), gris);
      caseta.position.set(x, y + an.alto * 0.78, z);
      const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 16, 4), gris);
      punta.position.set(x, y + an.alto + 8, z);
      g.add(fuste, caseta, punta);
    }

    // ---------- Casas blancas con tejado de teja (al fondo) ----------
    {
      const n = movil ? Math.round(A.casas * 0.6) : A.casas;
      const muros = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#f3f1ea' }), n);
      const tejados = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: '#b0573a' }), n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
      // en grupitos, como cortijos y barriadas
      let k = 0;
      while (k < n) {
        const a = rnd() * Math.PI * 2, r = R0 + 120 + rnd() * 700;
        const grupo = 2 + Math.floor(rnd() * 5);
        for (let j = 0; j < grupo && k < n; j++, k++) {
          const x = cx + Math.cos(a) * r + (rnd() - 0.5) * 60, z = cz + Math.sin(a) * r + (rnd() - 0.5) * 60;
          const w = 8 + rnd() * 10, h = 4 + rnd() * 4, d = 7 + rnd() * 8, y = sobreLoma(x, z);
          q.setFromEuler(e.set(0, rnd() * Math.PI, 0));
          muros.setMatrixAt(k, m.compose(p.set(x, y + h / 2 - 0.5, z), q, s.set(w, h, d)));
          tejados.setMatrixAt(k, m.compose(p.set(x, y + h - 0.5 + 1.2, z), q, s.set(w * 1.05, 2.4, d * 1.05)));
        }
      }
      g.add(muros, tejados);
    }

    // ---------- Muretes blancos y negros en las curvas (fotogramas 16, 20, 60 s) ----------
    {
      const mu = A.murete, paso = Math.max(1, Math.round(mu.largo / t.ds)), lista = [[], []];
      for (let i = 0; i < t.N; i += paso) {
        // ¿curva cerrada cerca? (mira 30 m alrededor)
        let kMax = 0;
        for (let d = -15; d <= 15; d += 3) kMax = Math.max(kMax, Math.abs(t.k[(i + d + t.N) % t.N]));
        if (kMax < mu.curvatura) continue;
        const lado = t.k[i] > 0 ? 1 : -1; // por fuera de la curva (curvatura + = derecha → fuera = izquierda)
        if (pista._enBoxes && pista._enBoxes(i, 30)) continue;
        const lat = lado * ((lado > 0 ? t.muroIzq[i] : t.muroDer[i]) - 0.6);
        lista[(i / paso) % 2 | 0].push([i, lat]);
      }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
      ['#f4f4f4', '#151515'].forEach((color, k) => {
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, mu.alto, mu.largo), new THREE.MeshLambertMaterial({ color }), lista[k].length);
        lista[k].forEach(([i, lat], j) => {
          const x = t.x[i] + t.nx[i] * lat, z = t.z[i] + t.nz[i] * lat;
          q.setFromEuler(e.set(0, Math.atan2(t.tx[i], t.tz[i]), 0));
          im.setMatrixAt(j, m.compose(p.set(x, t.alt[i] + mu.alto / 2, z), q, s.set(1, 1, 1)));
        });
        g.add(im);
      });
    }

    // ---------- Pancartas sobre postes ----------
    for (const P of A.pancartas) {
      const i = t.indice(P.s), lat = P.lado * (t.hwArr[i] + P.dist);
      const x = t.x[i] + t.nx[i] * lat, z = t.z[i] + t.nz[i] * lat, ang = Math.atan2(t.tx[i], t.tz[i]);
      if (!libre(x, z, P.ancho / 2 + 2)) continue; // caería sobre la pista: no se pone
      // de cara a los coches que llegan, algo girada hacia la pista
      const mat = pista.matPublicidad[P.marca % pista.matPublicidad.length];
      const panel = new THREE.Mesh(new THREE.BoxGeometry(P.ancho, P.alto, 0.3), mat);
      panel.position.set(x, t.alt[i] + P.elevacion + P.alto / 2, z);
      panel.rotation.y = ang + P.lado * 0.35;
      g.add(panel);
      if (P.elevacion > 1) {
        const poste = new THREE.MeshLambertMaterial({ color: '#555a60' });
        for (const f of [-0.4, 0.4]) {
          const pz = new THREE.Mesh(new THREE.BoxGeometry(0.4, P.elevacion, 0.4), poste);
          pz.position.set(x + Math.cos(panel.rotation.y) * f * P.ancho, t.alt[i] + P.elevacion / 2, z - Math.sin(panel.rotation.y) * f * P.ancho);
          g.add(pz);
        }
      }
    }

    // ---------- Caravanas y camiones blancos del paddock ----------
    {
      const C = A.caravanas, n = Math.floor((C.sFin - C.sIni) / C.cada);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#eceef0' }), n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let k = 0; k < n; k++) {
        const i = t.indice(C.sIni + k * C.cada), lat = C.lado * (C.dist + rnd() * 25);
        const largo = 8 + rnd() * 6, alto = 3 + rnd() * 1;
        q.setFromEuler(e.set(0, Math.atan2(t.tx[i], t.tz[i]) + (rnd() < 0.5 ? 0 : Math.PI / 2), 0));
        const x = t.x[i] + t.nx[i] * lat, z = t.z[i] + t.nz[i] * lat;
        const ok = libre(x, z, 14); // si cae sobre la pista (u otro tramo), no se pone (tamaño 0)
        im.setMatrixAt(k, m.compose(p.set(x, alto / 2, z), q, ok ? s.set(2.5, alto, largo) : s.set(0, 0, 0)));
      }
      g.add(im);
    }

    escena.add(g);
    return g;
  },

  // Hierba seca ocre con matas de color verde oscuro (las lomas de la onboard)
  _texturaLoma() {
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), rnd = Utils.semilla(7);
    g.fillStyle = '#b39a5e';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 900; k++) { // manchas de tono (más claras y más pardas)
      g.fillStyle = ['#c4ab6a', '#a38a52', '#b8a466', '#9c8b55'][k % 4];
      g.globalAlpha = 0.35;
      g.beginPath(); g.arc(rnd() * S, rnd() * S, 3 + rnd() * 10, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    for (let k = 0; k < 520; k++) { // matas de lentisco / acebuche
      const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 4.5;
      g.fillStyle = rnd() < 0.5 ? '#4a5630' : '#3d4a2a';
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  },
};
