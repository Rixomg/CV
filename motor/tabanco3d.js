/* ============================================================
   (24-11) TABANCO EN 3D — el huevo de pascua de la copa
   ------------------------------------------------------------
   Un tabanco jerezano junto a la recta: casita encalada con zócalo
   albero y tejado de teja, barra de madera abierta a la calle,
   botas negras marcadas con tiza, toldo rojo y blanco, letrero,
   barriles como mesas con taburetes, pizarra con los cuatro vinos,
   macetas con geranios, farolillos y suelo de albero.
   Tabanco3D.crear() devuelve un THREE.Group con la fachada mirando
   a +Z (vista3d.js lo gira hacia la pista). Medidas en metros.
   ============================================================ */

const Tabanco3D = {
  // Colores (se pueden tocar)
  COLORES: {
    cal: '#f4f1e8', albero: '#d6a63c', teja: '#b4593a', madera: '#6b3f1f', maderaClara: '#9a6534',
    bota: '#1c1410', aro: '#3a3a3a', toldo: ['#d4141c', '#ffffff'], suelo: '#dcbc78', hierro: '#2a2a2a',
  },

  crear() {
    const C = this.COLORES, g = new THREE.Group();
    g.name = 'tabanco';
    const M = {}; // materiales compartidos
    const mat = (k, color, extra = {}) => M[k] || (M[k] = new THREE.MeshLambertMaterial({ color, ...extra }));
    const caja = (w, h, d, m, x, y, z, padre = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); padre.add(o); return o; };
    const cil = (rA, rB, h, m, x, y, z, lados = 14, padre = g) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rA, rB, h, lados), m); o.position.set(x, y, z); padre.add(o); return o; };

    // ---------- Suelo de albero (patio delante) ----------
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), mat('suelo', C.suelo));
    suelo.rotation.x = -Math.PI / 2; suelo.position.set(0, 0.03, 0.6);
    g.add(suelo);

    // ---------- Casita encalada (7 × 3,4 × 4,5) ----------
    const W = 7, H = 3.4, D = 4.5, zC = -2.2; // zC = centro de la casa (detrás de la fachada)
    const fz = zC + D / 2;                    // z de la fachada
    const cal = mat('cal', C.cal), albero = mat('albero', C.albero);
    caja(W, H, 0.3, cal, 0, H / 2, zC - D / 2 + 0.15);                 // pared de atrás
    for (const s of [-1, 1]) caja(0.3, H, D, cal, s * (W / 2 - 0.15), H / 2, zC); // laterales
    // fachada con el hueco de la barra (3,8 × 1,7 m)
    const hx = 3.8, hy0 = 1.0, hy1 = 2.7;
    caja((W - hx) / 2, H, 0.3, cal, -(hx / 2 + (W - hx) / 4), H / 2, fz - 0.15);
    caja((W - hx) / 2, H, 0.3, cal, hx / 2 + (W - hx) / 4, H / 2, fz - 0.15);
    caja(hx, hy0, 0.3, cal, 0, hy0 / 2, fz - 0.15);
    caja(hx, H - hy1, 0.3, cal, 0, hy1 + (H - hy1) / 2, fz - 0.15);
    // zócalo albero (abajo) y recercado del hueco
    caja(W + 0.04, 0.6, D + 0.04, albero, 0, 0.3, zC);
    caja(hx + 0.4, 0.18, 0.34, albero, 0, hy1 + 0.09, fz - 0.15);
    for (const s of [-1, 1]) caja(0.2, hy1 - hy0, 0.34, albero, s * (hx / 2 + 0.1), (hy0 + hy1) / 2, fz - 0.15);
    // interior en penumbra (para que el hueco no se vea vacío)
    caja(W - 0.6, H - 0.2, 0.05, mat('fondo', '#3b2a1c'), 0, H / 2, zC - D / 2 + 0.32);
    caja(W - 0.6, 0.05, D - 0.6, mat('sueloIn', '#7a5a3a'), 0, 0.05, zC);

    // ---------- Tejado de teja a dos aguas ----------
    const teja = new THREE.MeshLambertMaterial({ map: this._texTeja() });
    const caida = 0.42, ancho = D / 2 + 0.5, largo = Math.hypot(ancho, ancho * Math.tan(caida));
    for (const s of [-1, 1]) {
      const faldon = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.12, largo), teja);
      faldon.position.set(0, H + Math.tan(caida) * ancho / 2, zC + s * ancho / 2);
      faldon.rotation.x = s * caida;
      g.add(faldon);
    }
    for (const s of [-1, 1]) { // hastiales (triángulos encalados de los lados)
      const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, Math.tan(caida) * D / 2)]);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), cal);
      m.material = mat('calDoble', C.cal, { side: THREE.DoubleSide });
      m.rotation.y = Math.PI / 2; m.position.set(s * (W / 2 - 0.15), H, zC);
      g.add(m);
    }

    // ---------- Letrero "TABANCO" sobre el hueco ----------
    const letrero = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.6), new THREE.MeshLambertMaterial({ map: this._texLetrero() }));
    letrero.position.set(0, 3.05, fz + 0.02);
    g.add(letrero);

    // ---------- Barra de madera y lo que hay encima ----------
    const madera = mat('madera', C.madera), clara = mat('clara', C.maderaClara);
    caja(4.2, 1.05, 0.7, madera, 0, 0.525, fz + 0.35);
    caja(4.4, 0.07, 0.85, clara, 0, 1.085, fz + 0.35);
    const vidrio = mat('vidrio', '#e8eef0', { transparent: true, opacity: 0.55 });
    const vinos = ['#e6d27a', '#c3832c', '#86401a', '#4b1b0b'];
    vinos.forEach((c, k) => { // botella + catavino de cada vino
      const x = -1.5 + k * 1.0;
      cil(0.045, 0.045, 0.28, mat('bot' + k, '#1d2a1a'), x, 1.26, fz + 0.3, 10);
      cil(0.02, 0.03, 0.08, mat('bot' + k, '#1d2a1a'), x, 1.44, fz + 0.3, 8);
      cil(0.035, 0.02, 0.07, vidrio, x + 0.25, 1.2, fz + 0.45, 10);           // copa
      cil(0.03, 0.017, 0.035, mat('vino' + k, c), x + 0.25, 1.185, fz + 0.45, 10); // vino dentro
      cil(0.005, 0.005, 0.06, vidrio, x + 0.25, 1.15, fz + 0.45, 6);          // pie
    });

    // ---------- Botas (barriles negros con tiza) dentro, en dos filas ----------
    const tiza = new THREE.MeshLambertMaterial({ map: this._texBota() });
    const bota = mat('bota', C.bota), aro = mat('aro', C.aro);
    for (let fila = 0; fila < 2; fila++) for (let k = 0; k < 5; k++) {
      const x = -2.4 + k * 1.2, y = 0.45 + fila * 0.86, z = zC - D / 2 + 0.95;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), [bota, tiza, bota]);
      b.rotation.x = Math.PI / 2; b.position.set(x, y, z);
      g.add(b);
      for (const dz of [-0.32, 0.32]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 4, 16), aro); a.position.set(x, y, z + dz); g.add(a); }
    }

    // ---------- Toldo rojo y blanco ----------
    const texT = this._texToldo();
    const toldo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.2), new THREE.MeshLambertMaterial({ map: texT, side: THREE.DoubleSide, alphaTest: 0.5 }));
    toldo.rotation.x = -Math.PI / 2 + 0.38;
    toldo.position.set(0, 2.95 - Math.sin(0.38) * 1.1 + 0.1, fz + Math.cos(0.38) * 1.1);
    g.add(toldo);
    const faldilla = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.32), new THREE.MeshLambertMaterial({ map: texT, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
    faldilla.position.set(0, 2.95 - Math.sin(0.38) * 2.2 - 0.06, fz + Math.cos(0.38) * 2.2);
    g.add(faldilla);
    for (const s of [-1, 1]) cil(0.03, 0.03, 2.4, mat('hierro', C.hierro), s * 2.5, 1.2, fz + 2.05, 6); // varillas

    // ---------- Mesas: botas de pie con tablero redondo y taburetes ----------
    const asiento = mat('asiento', '#2a1a10');
    for (const [x, z] of [[-3.2, fz + 3.0], [0.2, fz + 3.6], [3.4, fz + 2.8]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.0, 16), [bota, tiza, bota]);
      b.position.set(x, 0.5, z); g.add(b);
      for (const dy of [0.2, 0.8]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.02, 4, 16), aro); a.rotation.x = Math.PI / 2; a.position.set(x, dy, z); g.add(a); }
      cil(0.55, 0.55, 0.05, clara, x, 1.03, z, 18);
      cil(0.035, 0.03, 0.07, vidrio, x + 0.15, 1.09, z + 0.1, 8);
      for (const ang of [0.6, 0.6 + Math.PI]) { // dos taburetes altos
        const tx = x + Math.cos(ang) * 0.85, tz = z + Math.sin(ang) * 0.85;
        cil(0.2, 0.2, 0.06, asiento, tx, 0.72, tz, 12);
        for (const [dx, dz] of [[0.12, 0.12], [-0.12, 0.12], [0.12, -0.12], [-0.12, -0.12]]) caja(0.03, 0.7, 0.03, madera, tx + dx, 0.35, tz + dz);
      }
    }

    // ---------- Pizarra con los vinos (caballete) ----------
    const piz = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshLambertMaterial({ map: this._texPizarra(), side: THREE.DoubleSide }));
    piz.position.set(-4.3, 0.95, fz + 1.4); piz.rotation.set(-0.15, 0.35, 0);
    g.add(piz);
    for (const dx of [-0.4, 0.4]) { const p = caja(0.05, 1.6, 0.05, madera, -4.3 + dx * Math.cos(0.35), 0.78, fz + 1.4 - dx * Math.sin(0.35)); p.rotation.x = -0.15; }

    // ---------- Macetas con geranios: en la fachada y en el suelo ----------
    const barro = mat('barro', '#b5603a'), hoja = mat('hoja', '#3f7a2c'), flor = mat('flor', '#e0283a');
    const maceta = (x, y, z, r) => {
      cil(r, r * 0.75, r * 1.3, barro, x, y, z, 10);
      const h = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 6), hoja); h.position.set(x, y + r * 1.0, z); h.scale.y = 0.7; g.add(h);
      for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 6, 4), flor); f.position.set(x + Math.cos(k * 1.3) * r * 0.9, y + r * 1.35, z + Math.sin(k * 1.3) * r * 0.9); g.add(f); }
    };
    for (const x of [-3.0, -2.4, 2.4, 3.0]) maceta(x, 2.2, fz + 0.18, 0.13); // colgadas en la pared
    maceta(-2.7, 0.3, fz + 0.6, 0.3); maceta(2.7, 0.3, fz + 0.6, 0.3);       // grandes en el suelo

    // ---------- Farolillos entre dos postes ----------
    const poste = mat('poste', C.hierro);
    const xP = 5.4, zP = fz + 4.6;
    for (const s of [-1, 1]) cil(0.05, 0.06, 3.4, poste, s * xP, 1.7, zP, 6);
    const luz = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
    const colores = ['#e0283a', '#f2c230', '#2f7ad1', '#3aa04a', '#ffffff'];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, x = -xP + u * 2 * xP, y = 3.3 - Math.sin(Math.PI * u) * 0.45; // guirnalda que cuelga
      const z = zP - Math.sin(Math.PI * u) * 1.2;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), k % 2 ? luz : mat('farol' + (k % 5), colores[k % 5]));
      f.position.set(x, y, z); g.add(f);
    }

    // ---------- Dos botas tumbadas a un lado (como reclamo) ----------
    for (const [x, y] of [[-4.6, 0.42], [-4.6, 1.22]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 16), [bota, tiza, bota]);
      b.rotation.x = Math.PI / 2; b.position.set(x, y, fz - 0.8); g.add(b);
    }
    caja(1.2, 0.1, 1.3, madera, -4.6, 0.02, fz - 0.8); // durmientes

    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return g;
  },

  // ---------- Texturas dibujadas (canvas) ----------
  _lienzo(w, h, dibujar) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    dibujar(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  },
  _texTeja() {
    const t = this._lienzo(128, 128, (g, w, h) => {
      g.fillStyle = '#a84f32'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 22) {
        g.fillStyle = (x / 16 + y / 22) % 2 ? '#c06a45' : '#b4593a';
        g.beginPath(); g.ellipse(x + 8 + ((y / 22) % 2) * 8, y + 11, 7, 11, 0, 0, 7); g.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2);
    return t;
  },
  _texLetrero() {
    return this._lienzo(512, 86, (g, w, h) => {
      g.fillStyle = '#f2e6c8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a1a14'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#7a1a14'; g.font = 'bold 56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TABANCO', w / 2, h / 2 + 3);
    });
  },
  _texBota() { // fondo de la bota con números y letras de tiza
    return this._lienzo(128, 128, (g, w, h) => {
      g.fillStyle = '#1c1410'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2e241c'; g.lineWidth = 3;
      for (let x = 10; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } // duelas
      g.fillStyle = '#e8e4da'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
      g.fillText('FINO', w / 2, 58); g.font = 'bold 22px sans-serif'; g.fillText('1989', w / 2, 88);
    });
  },
  _texToldo() {
    return this._lienzo(256, 64, (g, w, h) => {
      const [a, b] = this.COLORES.toldo;
      for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? b : a; g.fillRect(k * 16, 0, 16, h); }
      // borde festoneado (para la faldilla): semicírculos abajo, transparente entre ellos
      g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(k * 16 + 16, h, 8, Math.PI, 0); g.fill(); }
    });
  },
  _texPizarra() {
    return this._lienzo(192, 256, (g, w, h) => {
      g.fillStyle = '#6b4424'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#23302a'; g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#efece2'; g.textAlign = 'center';
      g.font = 'bold 26px Georgia, serif'; g.fillText('HOY', w / 2, 46);
      g.font = '22px Georgia, serif';
      ['Fino', 'Amontillado', 'Oloroso', 'Cream'].forEach((n, k) => g.fillText(n, w / 2, 92 + k * 40));
    });
  },
};
