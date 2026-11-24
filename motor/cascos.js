/* ============================================================
   CASCOS (12-11) — decoración de cada piloto, como los de la F1 real (fotos en Cascos_reales/)
   ------------------------------------------------------------
   Cada piloto tiene SU casco, siempre el mismo (sale de una semilla con su código y su año) pero distinto del resto:
   se combinan colores (el suyo, los del equipo, complementarios, blanco, negro, oro, plata, fluor) y capas de dibujo
   (corona arriba, franjas, ondas, alas alrededor de la visera, flechas, llamas, cuadros, degradados, estrellas,
   rayas finas, número...). Con ~14 dibujos, 2-5 capas y colores libres, las combinaciones no se acaban.
   Algunos pilotos históricos llevan un diseño parecido al suyo de verdad (FIRMAS, abajo).
   El dibujo es un lienzo de 512×256 que envuelve la carcasa: x = vuelta alrededor (la VISERA mira a x = 128, la
   nuca a x = 384), y = de arriba (0) a abajo (256).
   Para tocar: añade dibujos a CAPAS o firmas a FIRMAS. Cascos.textura(piloto, equipo) devuelve la textura.
   ============================================================ */
const Cascos = {
  _cache: new Map(),

  // Diseños parecidos a los reales (colores base y capas fijas). ref = como en HISTORICO (sin el año)
  FIRMAS: {
    senna: { base: '#ffd400', capas: [['franjaVisera', '#0a8a3a', 0.18], ['franjaVisera', '#1b3d9e', 0.08]] },
    alonso: { base: '#f7d117', capas: [['corona', '#1450a8'], ['franja', '#d4001a', 0.62, 10], ['franja', '#1450a8', 0.72, 8]] },
    hamilton: { base: '#ffd400', capas: [['corona', '#ffd400'], ['alas', '#0b8f43'], ['rayasFinas', '#6a2bb5']] },
    prost: { base: '#ffffff', capas: [['franja', '#1d3c9e', 0.55, 22], ['franja', '#d4001a', 0.66, 6], ['corona', '#1d3c9e']] },
    mansell: { base: '#1c2f6e', capas: [['franja', '#ffffff', 0.5, 14], ['franja', '#d4001a', 0.58, 8], ['flechas', '#ffffff']] },
    lauda: { base: '#d4001a', capas: [['franja', '#ffffff', 0.55, 12], ['numero', '#ffffff']] },
    michael_schumacher: { base: '#d4001a', capas: [['corona', '#ffffff'], ['estrellas', '#ffd400'], ['franja', '#1a1a1a', 0.7, 8]] },
    raikkonen: { base: '#ffffff', capas: [['corona', '#111111'], ['alas', '#d4001a'], ['rayasFinas', '#111111']] },
    vettel: { base: '#ffffff', capas: [['corona', '#d4001a'], ['ondas', '#1a1a1a'], ['estrellas', '#ffd400']] },
    max_verstappen: { base: '#ff7a00', capas: [['corona', '#16224d'], ['llamas', '#d4001a'], ['numero', '#ffffff']] },
    hakkinen: { base: '#ffffff', capas: [['corona', '#0b3f91'], ['franjaVisera', '#00a3e0', 0.12]] },
    piquet: { base: '#ffffff', capas: [['corona', '#ffd400'], ['franja', '#0a8a3a', 0.6, 14]] },
    damon_hill: { base: '#0b1f4a', capas: [['remos', '#ffffff']] },
    villeneuve: { base: '#ffffff', capas: [['franjaVisera', '#1b3d9e', 0.1], ['corona', '#ffffff'], ['rayasFinas', '#d4001a']] },
    gilles_villeneuve: { base: '#ffffff', capas: [['corona', '#d4001a'], ['franjaVisera', '#1b3d9e', 0.1]] },
    button: { base: '#ffffff', capas: [['corona', '#ffd400'], ['franja', '#1a1a1a', 0.62, 10]] },
    leclerc: { base: '#d4001a', capas: [['corona', '#ffffff'], ['rayasFinas', '#ffffff']] },
    sainz: { base: '#d4001a', capas: [['corona', '#ffd400'], ['ondas', '#ffd400']] },
    rosberg: { base: '#ffffff', capas: [['corona', '#ffd400'], ['franja', '#0b3f91', 0.6, 10]] },
    coulthard: { base: '#ffffff', capas: [['corona', '#1b3d9e'], ['cruzAspa', '#ffffff']] },
  },

  // Colores "de casco" que combinan con cualquier cosa
  EXTRA: ['#ffffff', '#111111', '#d4af37', '#c0c4cc', '#ff2a6d', '#00e5ff', '#c6ff00', '#ff6a00', '#7b2ff7', '#00c853', '#ffd400', '#0b3f91', '#d4001a'],

  textura(piloto, equipo) {
    const h = piloto.historico, ref = h ? (h.ref || String(h.id || '').replace(/_\d{4}$/, '')) : null;
    // (15-11) Modo Carrera: el casco que diseña el jugador (piloto.disenoCasco = { base, capas }) manda sobre todo
    const propio = piloto.disenoCasco || null;
    const clave = (ref || piloto.codigo || piloto.apellido) + '_' + (h ? h.anio : '') + '_' + (piloto.casco || '') + (propio ? JSON.stringify(propio) + piloto.numero : '');
    if (this._cache.has(clave)) return this._cache.get(clave);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const x = cv.getContext('2d');
    const rnd = this._azar(clave);
    const firma = propio || (ref && this.FIRMAS[ref]);
    const base = firma ? firma.base : (piloto.casco || (equipo && equipo.colores.principal) || '#ffffff');
    const pal = this._paleta(base, equipo, rnd);
    // fondo (a veces con degradado de arriba a abajo)
    if (!firma && rnd() < 0.3) { const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, pal[1]); g.addColorStop(0.55, base); g.addColorStop(1, base); x.fillStyle = g; }
    else x.fillStyle = base;
    x.fillRect(0, 0, 512, 256);
    const capas = firma ? firma.capas : this._capasAlAzar(pal, rnd);
    for (const [tipo, color, ...args] of capas) if (this.CAPAS[tipo]) { x.save(); this.CAPAS[tipo].call(this, x, color, rnd, piloto, ...args); x.restore(); }
    // Siempre: ribete oscuro alrededor de la visera y la mentonera algo más oscura (como en las fotos)
    x.fillStyle = 'rgba(0,0,0,0.85)'; this._elipse(x, 128, 118, 74, 26); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(70, 200, 116, 56);
    // brillo: barniz arriba
    const b = x.createLinearGradient(0, 0, 0, 120); b.addColorStop(0, 'rgba(255,255,255,0.22)'); b.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = b; x.fillRect(0, 0, 512, 120);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { base };
    this._cache.set(clave, tex);
    return tex;
  },

  // Color de la visera (espejo): ahumada, oro, azul, roja, plata, arcoíris... también por semilla
  visera(piloto) {
    if (piloto.visera) return piloto.visera; // (15-11) la que elige el jugador en el Modo Carrera
    const h = piloto.historico, clave = 'v' + (h ? h.id : piloto.codigo);
    const r = this._azar(clave)();
    return r < 0.4 ? '#141414' : r < 0.55 ? '#c99a1a' : r < 0.7 ? '#1f5fd6' : r < 0.8 ? '#b3122e' : r < 0.9 ? '#9aa4b1' : '#6a2bb5';
  },

  _paleta(base, equipo, rnd) {
    const c = new THREE.Color(base), hsl = {}; c.getHSL(hsl);
    const comp = new THREE.Color().setHSL((hsl.h + 0.5) % 1, Math.max(0.6, hsl.s), 0.5).getStyle();
    const ana = new THREE.Color().setHSL((hsl.h + (rnd() < 0.5 ? 0.08 : -0.08) + 1) % 1, Math.max(0.5, hsl.s), Math.min(0.6, hsl.l + 0.1)).getStyle();
    const eq = equipo ? [equipo.colores.principal, equipo.colores.secundario, equipo.colores.acento].filter(Boolean) : [];
    const todos = [...eq, comp, ana, ...this.EXTRA].filter((k) => k && k.toLowerCase() !== String(base).toLowerCase());
    // mezcla y quédate con 4 que contrasten con la base
    const out = [];
    while (out.length < 4 && todos.length) { const k = todos.splice(Math.floor(rnd() * todos.length), 1)[0]; if (Math.abs(new THREE.Color(k).getHSL({}).l - hsl.l) > 0.12 || out.length >= 2) out.push(k); }
    while (out.length < 4) out.push(hsl.l > 0.5 ? '#111111' : '#ffffff');
    return [base, ...out];
  },

  _capasAlAzar(pal, rnd) {
    const tipos = Object.keys(this.CAPAS), n = 2 + Math.floor(rnd() * 4), capas = [];
    if (rnd() < 0.7) capas.push(['corona', pal[1 + Math.floor(rnd() * 4)]]);
    for (let i = 0; i < n; i++) {
      const t = tipos[Math.floor(rnd() * tipos.length)];
      capas.push([t, pal[1 + Math.floor(rnd() * 4)], 0.35 + rnd() * 0.45, 4 + rnd() * 18]);
    }
    if (rnd() < 0.35) capas.push(['numero', pal[1 + Math.floor(rnd() * 4)]]);
    return capas;
  },

  // ---------- DIBUJOS (cada uno pinta sobre el lienzo; la visera está en x≈128, la nuca en x≈384) ----------
  CAPAS: {
    corona(x, col) { x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.lineTo(512, 0); x.lineTo(512, 46); for (let i = 512; i >= 0; i -= 32) x.lineTo(i, 46 + Math.sin(i / 40) * 10); x.closePath(); x.fill(); },
    franja(x, col, rnd, p, y = 0.6, alto = 12) { x.fillStyle = col; x.fillRect(0, y * 256, 512, alto); },
    franjaVisera(x, col, rnd, p, ancho = 0.12) { x.fillStyle = col; x.beginPath(); x.ellipse(128, 118, 96 + ancho * 200, 44 + ancho * 120, 0, 0, Math.PI * 2); x.ellipse(128, 118, 86, 36, 0, 0, Math.PI * 2, true); x.fill('evenodd'); },
    ondas(x, col, rnd, p, y = 0.55, alto = 10) { x.strokeStyle = col; x.lineWidth = alto; const f = 2 + Math.floor(rnd() * 3); x.beginPath(); for (let i = 0; i <= 512; i += 4) x.lineTo(i, y * 256 + Math.sin((i / 512) * Math.PI * 2 * f) * 22); x.stroke(); },
    alas(x, col) { x.fillStyle = col; for (const s of [1, -1]) { x.beginPath(); x.moveTo(128 + s * 70, 90); x.bezierCurveTo(128 + s * 150, 40, 128 + s * 230, 70, 128 + s * 256, 150); x.bezierCurveTo(128 + s * 200, 120, 128 + s * 140, 140, 128 + s * 80, 150); x.closePath(); x.fill(); } },
    flechas(x, col, rnd) { x.fillStyle = col; const y0 = 60 + rnd() * 80; for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const cx = 128 + s * (110 + i * 40); x.beginPath(); x.moveTo(cx, y0); x.lineTo(cx + s * 26, y0 - 18); x.lineTo(cx + s * 36, y0 - 18); x.lineTo(cx + s * 10, y0); x.lineTo(cx + s * 36, y0 + 18); x.lineTo(cx + s * 26, y0 + 18); x.closePath(); x.fill(); } },
    llamas(x, col, rnd) { x.fillStyle = col; for (const s of [1, -1]) { x.beginPath(); x.moveTo(128 + s * 80, 256); for (let i = 0; i < 6; i++) { const px = 128 + s * (90 + i * 30); x.quadraticCurveTo(px, 150 - rnd() * 60, px + s * 12, 256 - 40 - rnd() * 40); } x.lineTo(128 + s * 256, 256); x.closePath(); x.fill(); } },
    cuadros(x, col, rnd, p, y = 0.62) { x.fillStyle = col; const yy = y * 256; for (let i = 0; i < 512; i += 12) for (let j = 0; j < 2; j++) if ((i / 12 + j) % 2 === 0) x.fillRect(i, yy + j * 12, 12, 12); },
    diagonales(x, col, rnd) { x.fillStyle = col; const a = rnd() < 0.5 ? 1 : -1; for (let i = -256; i < 512; i += 56) { x.beginPath(); x.moveTo(i, 256); x.lineTo(i + 18, 256); x.lineTo(i + 18 + a * 120, 0); x.lineTo(i + a * 120, 0); x.closePath(); x.fill(); } },
    estrellas(x, col, rnd) { x.fillStyle = col; for (let k = 0; k < 9; k++) { const cx = rnd() * 512, cy = 20 + rnd() * 200, r = 6 + rnd() * 9; x.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); } },
    rayasFinas(x, col, rnd) { x.strokeStyle = col; x.lineWidth = 3; const y = 70 + rnd() * 120; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(0, y + k * 9); x.bezierCurveTo(170, y + k * 9 - 40, 340, y + k * 9 + 40, 512, y + k * 9); x.stroke(); } },
    nuca(x, col) { x.fillStyle = col; x.beginPath(); x.ellipse(384, 150, 80, 110, 0, 0, Math.PI * 2); x.fill(); },
    puntos(x, col, rnd) { x.fillStyle = col; for (let i = 0; i < 512; i += 16) for (let j = 150; j < 256; j += 16) { const r = ((j - 150) / 106) * 6; x.beginPath(); x.arc(i + (j % 32 ? 8 : 0), j, r, 0, Math.PI * 2); x.fill(); } },
    remos(x, col) { x.fillStyle = col; for (let i = 0; i < 512; i += 64) { x.fillRect(i + 26, 20, 12, 150); x.beginPath(); x.ellipse(i + 32, 180, 18, 30, 0, 0, Math.PI * 2); x.fill(); } },
    cruzAspa(x, col) { x.strokeStyle = col; x.lineWidth = 26; for (const s of [1, -1]) { x.beginPath(); x.moveTo(256 - 120, 128 - s * 110); x.lineTo(512, 128 + s * 110); x.stroke(); } },
    numero(x, col, rnd, p) { if (!p || !p.numero) return; x.fillStyle = col; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(p.numero), 384, 110); x.font = 'bold 30px Arial'; x.fillText(String(p.numero), 256, 40); },
  },

  _elipse(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); },
  _azar(s) { let h = 1779033703; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
};
