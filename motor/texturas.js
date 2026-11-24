/* ============================================================
   TEXTURAS — todas se DIBUJAN por código en un <canvas>.
   Ventaja: el juego no necesita descargar imágenes y puedes
   cambiar colores o marcas de publicidad aquí mismo.
   ============================================================ */

const Texturas = {
  _cache: {},

  // Crea (o reutiliza) una textura dibujada con la función "dibujar"
  _crear(clave, ancho, alto, dibujar, opciones = {}) {
    if (this._cache[clave]) return this._cache[clave];
    const c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto;
    const g = c.getContext('2d');
    dibujar(g, ancho, alto);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = opciones.repetir === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = 8;
    this._cache[clave] = t;
    return t;
  },

  // Rellena con puntitos de ruido (da textura "real" a superficies)
  _ruido(g, w, h, cantidad, colores, tamMax = 2) {
    for (let i = 0; i < cantidad; i++) {
      g.fillStyle = colores[Math.floor(Math.random() * colores.length)];
      const t = Math.random() * tamMax + 0.5;
      g.fillRect(Math.random() * w, Math.random() * h, t, t);
    }
  },

  // Asfalto más oscuro y de grano grueso (áridos claros sueltos), para circuitos con visual.asfalto.granulado
  asfaltoGranulado() {
    return this._crear('asfaltoGranulado', 512, 512, (g, w, h) => {
      g.fillStyle = '#46494d';
      g.fillRect(0, 0, w, h);
      this._ruido(g, w, h, 30000, ['#3c3f43', '#515458', '#35383b', '#5a5d61', '#2f3235'], 2.6);
      this._ruido(g, w, h, 5000, ['#74777b', '#6a6d70', '#808387'], 1.4); // piedrecitas claras
      this._ruido(g, w, h, 3000, ['#26282b', '#2b2d30'], 3.2);           // poros oscuros
      g.globalAlpha = 0.07;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = Math.random() < 0.6 ? '#000' : '#fff';
        g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 140, 30 + Math.random() * 100);
      }
      g.globalAlpha = 1;
    });
  },

  asfalto() {
    return this._crear('asfalto', 512, 512, (g, w, h) => {
      g.fillStyle = '#55585c';
      g.fillRect(0, 0, w, h);
      this._ruido(g, w, h, 26000, ['#4a4d51', '#5f6266', '#45484b', '#686b6f', '#3f4245'], 2.2);
      // Parches de asfalto reparado
      g.globalAlpha = 0.08;
      for (let i = 0; i < 6; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
        g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 30 + Math.random() * 90);
      }
      g.globalAlpha = 1;
    });
  },

  // franjas: contraste de las franjas del cortacésped (0,05 = suave; 0,12 = dos tonos bien visibles)
  cesped(color, franjas = 0.05) {
    return this._crear('cesped' + color + franjas, 256, 256, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      // Franjas de cortacésped
      g.fillStyle = `rgba(255,255,255,${franjas})`;
      g.fillRect(0, 0, w / 2, h);
      const [r, gg, b] = Utils.hexA_rgb(color);
      const tonos = [-18, -10, 8, 15].map((d) => `rgb(${r + d},${gg + d},${b + d})`);
      this._ruido(g, w, h, 9000, tonos, 1.6);
    });
  },

  grava() {
    return this._crear('grava', 256, 256, (g, w, h) => {
      g.fillStyle = '#c9b48a';
      g.fillRect(0, 0, w, h);
      this._ruido(g, w, h, 14000, ['#b39d74', '#d8c49b', '#a48f68', '#e2d2ae', '#8f7b57'], 2.5);
    });
  },

  // Muro de neumáticos visto de frente: filas de neumáticos negros apilados, con una cinta roja
  neumaticos() {
    return this._crear('neumaticos', 256, 64, (g, w, h) => {
      g.fillStyle = '#121212';
      g.fillRect(0, 0, w, h);
      const filas = 4, an = 32, al = h / filas;
      for (let f = 0; f < filas; f++) {
        for (let k = -1; k < w / an; k++) {
          const x = k * an + (f % 2) * an / 2, y = f * al;
          g.fillStyle = '#262626'; // banda de rodadura
          g.beginPath(); g.ellipse(x + an / 2, y + al / 2, an / 2 - 1, al / 2 - 1, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#0a0a0a'; // hueco del centro
          g.beginPath(); g.ellipse(x + an / 2, y + al / 2, an / 4, al / 4, 0, 0, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = 'rgba(210,30,30,0.85)'; g.fillRect(0, al * 2 - 3, w, 6); // cinta que sujeta la pila
    });
  },

  // Logo gigante pintado en el asfalto de las escapatorias (fondo transparente)
  logoSuelo(texto = 'BOX BOX') {
    return this._crear('logoSuelo' + texto, 1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '900 italic 190px "Barlow Condensed", "Titillium Web", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillText(texto, w / 2, h / 2 + 8);
    });
  },

  // Pianos (rojo y blanco por defecto; circuitos.js → visual.piano: [color1, color2]). En el eje V se repiten las franjas
  piano(c1 = '#d42020', c2 = '#f2f2f2') {
    return this._crear('piano' + c1 + c2, 64, 128, (g, w, h) => {
      g.fillStyle = c1;
      g.fillRect(0, 0, w, h / 2);
      g.fillStyle = c2;
      g.fillRect(0, h / 2, w, h / 2);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 0, 6, h);
    });
  },

  // Línea de meta a cuadros
  cuadros() {
    return this._crear('cuadros', 128, 32, (g, w, h) => {
      const t = 16;
      for (let x = 0; x < w / t; x++) for (let y = 0; y < h / t; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
        g.fillRect(x * t, y * t, t, t);
      }
    });
  },

  // Marcas publicitarias inventadas
  MARCAS: [
    { texto: 'VELOX', fondo: '#0a2a6b', color: '#ffffff' },
    { texto: 'NORTHWIND', fondo: '#111111', color: '#00e5d4' },
    { texto: 'QUANTA FUEL', fondo: '#d6001c', color: '#ffffff' },
    { texto: 'SOLEA', fondo: '#ffcc00', color: '#1a1a1a' },
    { texto: 'ÓRBITA', fondo: '#2b0b4a', color: '#ffe066' },
    { texto: 'KAPPA TYRES', fondo: '#f2f2f2', color: '#c1121f' },
    { texto: 'AEROLINK', fondo: '#005f73', color: '#ffffff' },
    { texto: 'BOX BOX', fondo: '#000000', color: '#ff2a2a' },
  ],

  publicidad(i) {
    return this.publicidadMarca(this.MARCAS[i % this.MARCAS.length], 'pub' + i);
  },

  // Cartel de una marca { texto, fondo, color } (los circuitos pueden traer su propia lista)
  publicidadMarca(m, clave = 'pub_' + m.texto + m.fondo) {
    return this._crear(clave, 512, 64, (g, w, h) => {
      g.fillStyle = m.fondo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = m.color;
      g.font = 'bold 40px "Arial Black", Arial, sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillText(m.texto, w / 2, h / 2 + 2, w - 24); // si es largo, se estrecha para caber
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(0, 0, w, 3);
    });
  },

  // Escapatoria de asfalto pintado (estilo Monza): verde con franjas rojas y naranjas
  // atravesadas a la pista (la textura se repite cada 10 m a lo largo de la escapatoria)
  // Fachada del Casino de Montecarlo (constructorPista._casino): planta baja almohadillada con puertas en arco,
  // planta noble con ventanales en arco y pilastras entre ellos, friso y balaustrada arriba. Un tramo = 9 m
  fachadaCasino() {
    return this._crear('fachadaCasino', 192, 256, (g, w, h) => {
      g.fillStyle = '#f3e9d6'; g.fillRect(0, 0, w, h);
      // Planta baja (abajo): sillares (líneas horizontales) y dos arcos
      g.fillStyle = 'rgba(120,95,60,0.25)';
      for (let y = 170; y < h; y += 12) g.fillRect(0, y, w, 2);
      g.fillStyle = '#4d3f30';
      for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.arc(x, 205, 22, Math.PI, 0); g.lineTo(x + 22, h); g.lineTo(x - 22, h); g.fill(); }
      // Cornisa de la planta baja
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 160, w, 7);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 167, w, 3);
      // Planta noble: ventanales en arco con marco claro y pilastras
      for (const x of [w * 0.25, w * 0.75]) {
        g.fillStyle = '#fbf6ec'; g.beginPath(); g.arc(x, 78, 27, Math.PI, 0); g.lineTo(x + 27, 150); g.lineTo(x - 27, 150); g.fill();
        g.fillStyle = '#2f3b44'; g.beginPath(); g.arc(x, 80, 21, Math.PI, 0); g.lineTo(x + 21, 146); g.lineTo(x - 21, 146); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 1, 60, 2, 86); g.fillRect(x - 21, 104, 42, 2); // carpintería
        g.fillStyle = '#c9a64a'; g.fillRect(x - 24, 146, 48, 4); // balcón dorado
      }
      g.fillStyle = 'rgba(0,0,0,0.10)';
      for (const x of [0, w / 2, w]) g.fillRect(x - 7, 40, 14, 120);  // pilastras (sombra)
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (const x of [0, w / 2, w]) g.fillRect(x - 5, 40, 10, 120);  // pilastras (luz)
      // Friso, guirnaldas y balaustrada arriba
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, 28, w, 10);
      g.fillStyle = 'rgba(150,120,70,0.35)'; for (let x = 6; x < w; x += 16) { g.beginPath(); g.arc(x + 4, 33, 4, 0, Math.PI); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.15)'; for (let x = 4; x < w; x += 10) g.fillRect(x, 6, 4, 18);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0, 2, w, 5); g.fillRect(0, 22, w, 5);
    });
  },

  // Pavimento de ciudad (Mónaco): losas de cemento gris claro con juntas y alguna mancha. Un tramo = 12 m
  pavimento() {
    return this._crear('pavimento', 128, 128, (g, w, h) => {
      g.fillStyle = '#a7a59f'; g.fillRect(0, 0, w, h);
      this._ruido(g, w, h, 1800, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.07)'], 2);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      for (let k = 0; k <= w; k += 32) { g.fillRect(k, 0, 1, h); g.fillRect(0, k, w, 1); } // juntas de las losas
      g.fillStyle = 'rgba(60,55,50,0.10)';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 10, 0, Math.PI * 2); g.fill(); }
    });
  },

  // Escapatoria "cebra": franjas rojas y blancas en diagonal pintadas sobre el asfalto (Nouvelle Chicane)
  cebra() {
    return this._crear('cebra', 128, 128, (g, w, h) => {
      g.fillStyle = '#f2f2f2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d0202a';
      for (let k = -w; k < w * 2; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 + h, h); g.lineTo(k + h, h); g.fill(); }
      this._ruido(g, w, h, 600, ['rgba(0,0,0,0.10)', 'rgba(255,255,255,0.05)'], 2);
    });
  },

  // bandas: true = franjas roja y naranja (Monza) · false = lisa · [c1, c2] = esos dos colores (Spa: rojo y amarillo)
  escapatoriaPintada(fondo = '#2f7a3a', bandas = true) {
    const cb = Array.isArray(bandas) ? bandas : ['#d23a2a', '#f08a24'];
    return this._crear('pintada' + fondo + (bandas ? cb.join('') : 'L'), 64, 256, (g, w, h) => {
      g.fillStyle = fondo;
      g.fillRect(0, 0, w, h);
      if (bandas) { g.fillStyle = cb[0]; g.fillRect(0, 96, w, 30); g.fillStyle = cb[1]; g.fillRect(0, 224, w, 30); }
      this._ruido(g, w, h, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'], 2);
    });
  },

  // Tribuna llena de gente: filas de puntos de colores
  publico() {
    return this._crear('publico', 512, 512, (g, w, h) => {
      g.fillStyle = '#2b2f36';
      g.fillRect(0, 0, w, h);
      const filas = 32, por = 64;
      const colores = ['#e63946', '#f1faee', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ff7a1a', '#d1121f', '#222', '#8d99ae', '#ffffff'];
      for (let f = 0; f < filas; f++) {
        g.fillStyle = '#3b4048';
        g.fillRect(0, f * (h / filas) + h / filas - 3, w, 3); // escalón
        for (let p = 0; p < por; p++) {
          if (Math.random() < 0.12) continue; // asiento vacío
          g.fillStyle = colores[Math.floor(Math.random() * colores.length)];
          const x = p * (w / por) + Math.random() * 2, y = f * (h / filas) + 2;
          g.fillRect(x + 1, y + 4, 5, 6); // cuerpo
          g.fillStyle = '#e0b49a';
          g.fillRect(x + 2, y, 3, 4); // cabeza
        }
      }
    });
  },

  // Red de seguridad (vallas) con transparencia
  red() {
    // (05-11, estilo F1 Clash) Malla más fina: 4 rombos por repetición en vez de 1 (cada rombo ~37 cm)
    // y un cable más grueso arriba. ROMBOS = cuántos rombos caben a lo ancho de una repetición.
    const ROMBOS = 4;
    return this._crear('red', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(205,210,215,0.95)';
      g.lineWidth = 2.2;
      g.beginPath();
      for (let k = -ROMBOS; k <= ROMBOS; k++) {
        const o = (k * w) / ROMBOS;
        g.moveTo(o, 0); g.lineTo(o + w, h); // diagonales "\"
        g.moveTo(o + w, 0); g.lineTo(o, h); // diagonales "/"
      }
      g.stroke();
      g.fillStyle = 'rgba(170,175,180,1)';
      g.fillRect(0, 0, w, 4); // cable de arriba
    });
  },

  // Fachada de un garaje con el color y nombre del equipo
  garaje(equipo) {
    return this._crear('garaje' + equipo.id, 256, 256, (g, w, h) => {
      g.fillStyle = '#d9dde2';
      g.fillRect(0, 0, w, h);
      // Hueco del garaje (interior oscuro con luz)
      const grad = g.createLinearGradient(0, 60, 0, h);
      grad.addColorStop(0, '#30343a');
      grad.addColorStop(1, '#15171a');
      g.fillStyle = grad;
      g.fillRect(14, 70, w - 28, h - 70);
      // Paneles de color del equipo dentro
      g.fillStyle = equipo.colores.principal;
      g.fillRect(14, 70, w - 28, 22);
      g.fillStyle = equipo.colores.acento;
      g.fillRect(14, 92, w - 28, 4);
      // Rótulo superior
      g.fillStyle = equipo.colores.secundario;
      g.fillRect(0, 10, w, 46);
      g.fillStyle = equipo.colores.principal;
      g.font = 'bold 30px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(equipo.nombre.toUpperCase(), w / 2, 34, w - 16);
      // Luces del techo
      g.fillStyle = 'rgba(255,255,240,0.9)';
      for (let i = 0; i < 5; i++) g.fillRect(30 + i * 45, 100, 24, 3);
    }, { repetir: false });
  },

  // Número del coche (para el morro y el alerón)
  numero(n, colorFondo, colorTexto) {
    return this._crear(`num${n}${colorFondo}`, 128, 128, (g, w, h) => {
      g.fillStyle = colorFondo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = colorTexto;
      g.font = 'bold italic 84px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), w / 2, h / 2 + 4);
    }, { repetir: false });
  },

  // Decoración lateral del coche: nombre del equipo sobre su color
  lateralCoche(equipo) {
    return this._crear('lat' + equipo.id, 512, 128, (g, w, h) => {
      g.fillStyle = equipo.colores.principal;
      g.fillRect(0, 0, w, h);
      g.fillStyle = equipo.colores.secundario;
      g.beginPath();
      g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.35); g.lineTo(w, h); g.lineTo(0, h);
      g.fill();
      g.fillStyle = equipo.colores.acento;
      g.fillRect(0, h * 0.55, w, 5);
      g.fillStyle = equipo.colores.secundario === '#ffffff' ? '#111' : '#ffffff';
      g.font = 'bold 44px Arial, sans-serif';
      g.textBaseline = 'middle';
      g.fillText(equipo.nombre.toUpperCase(), 24, h * 0.3, w - 40);
    }, { repetir: false });
  },

  // Flanco del neumático: banda y letras en blanco (el material la tiñe
  // con el color del compuesto). Fondo transparente.
  flancoNeumatico() {
    return this._crear('flanco', 256, 256, (g, w, h) => {
      const cx = w / 2, cy = h / 2;
      g.strokeStyle = '#fff';
      g.lineWidth = 9;
      g.beginPath(); g.arc(cx, cy, 117, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, 93, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff';
      g.font = 'bold 15px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const inicio of [0, Math.PI]) {
        const texto = 'BOX BOX';
        for (let i = 0; i < texto.length; i++) {
          const a = inicio + (i - texto.length / 2) * 0.13;
          g.save();
          g.translate(cx + Math.cos(a) * 102, cy + Math.sin(a) * 102);
          g.rotate(a + Math.PI / 2);
          g.fillText(texto[i], 0, 0);
          g.restore();
        }
      }
    }, { repetir: false });
  },

  // Gota borrosa (spray de lluvia, brillos)
  mancha() {
    return this._crear('mancha', 64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }, { repetir: false });
  },

  // Cartel de distancia a la curva (300, 200, 100)
  // Fachada de Montecarlo (constructorPista._fachadas): 6 plantas × 4 ventanas por trozo, con persianas y
  // balcones de hierro. Fondo casi blanco: el color de cada edificio lo pone el material. "clasica" (Hôtel
  // de Paris, Casino): ventanas en arco, cornisas marcadas y planta baja con soportales
  fachada(clasica = false) {
    return this._crear('fachada' + (clasica ? 'C' : ''), 256, 384, (g, w, h) => {
      g.fillStyle = '#f4f1ea';
      g.fillRect(0, 0, w, h);
      const pl = h / 6, an = w / 4;
      for (let f = 0; f < 6; f++) {
        const y0 = f * pl;
        g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, y0 + pl - (clasica ? 7 : 3), w, clasica ? 7 : 3); // cornisa
        if (f === 5 && clasica) { // planta baja: soportales
          for (let k = 0; k < 4; k++) { g.fillStyle = '#5b4a3a'; g.beginPath(); g.arc(k * an + an / 2, y0 + 30, an * 0.34, Math.PI, 0); g.lineTo(k * an + an * 0.84, y0 + pl); g.lineTo(k * an + an * 0.16, y0 + pl); g.fill(); }
          continue;
        }
        for (let k = 0; k < 4; k++) {
          const x = k * an + an * 0.28, vw = an * 0.44, vy = y0 + pl * 0.2, vh = pl * 0.6;
          g.fillStyle = '#3d4a55'; // cristal
          if (clasica) { g.beginPath(); g.arc(x + vw / 2, vy + vw / 2, vw / 2, Math.PI, 0); g.rect(x, vy + vw / 2, vw, vh - vw / 2); g.fill(); }
          else g.fillRect(x, vy, vw, vh);
          g.fillStyle = k % 2 ? '#6f7f5a' : '#7a6a52'; // persianas (verde o madera)
          g.fillRect(x - 7, vy, 6, vh); g.fillRect(x + vw + 1, vy, 6, vh);
          g.fillStyle = '#2b2b2b'; // balcón de hierro
          g.fillRect(x - 8, vy + vh - 2, vw + 16, 3);
          for (let b = x - 6; b < x + vw + 8; b += 4) g.fillRect(b, vy + vh - 12, 1, 10);
        }
      }
    });
  },

  // Guardarraíl de calle (circuitos.js → visual.guardarrail, Mónaco): 3 bandas de chapa ondulada galvanizada, una
  // encima de otra, con tornillos y algo de suciedad abajo. Cada repetición = 4 m de largo y toda la altura del muro
  guardarrail() {
    return this._crear('guardarrail', 256, 96, (g, w, h) => {
      g.fillStyle = '#4a4d50'; // lo que se ve por las rendijas (sombra de detrás)
      g.fillRect(0, 0, w, h);
      const bandas = 3, alto = h / bandas;
      for (let k = 0; k < bandas; k++) {
        const y0 = k * alto + 2, y1 = (k + 1) * alto - 2;
        // Perfil en W: claro arriba y abajo, sombra en el pliegue del medio
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, '#e2e5e7'); gr.addColorStop(0.22, '#c4c8cb'); gr.addColorStop(0.45, '#8e9396');
        gr.addColorStop(0.55, '#9da2a5'); gr.addColorStop(0.78, '#cfd3d5'); gr.addColorStop(1, '#a9aeb1');
        g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
        // Tornillos en los empalmes (cada 4 m) y en los postes (cada 2 m)
        g.fillStyle = '#5a5e61';
        for (const x of [4, 10, w / 2 + 4]) for (const yy of [y0 + 5, y1 - 6]) g.fillRect(x, yy, 3, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y0, 2, y1 - y0); // junta entre tramos
      }
      // Suciedad y rozaduras de goma (sobre todo abajo)
      this._ruido(g, w, h, 500, ['rgba(60,55,50,0.25)', 'rgba(255,255,255,0.15)'], 2);
      const su = g.createLinearGradient(0, h * 0.6, 0, h);
      su.addColorStop(0, 'rgba(70,62,52,0)'); su.addColorStop(1, 'rgba(70,62,52,0.35)');
      g.fillStyle = su; g.fillRect(0, h * 0.6, w, h * 0.4);
      g.fillStyle = 'rgba(20,20,20,0.35)';
      for (let i = 0; i < 4; i++) g.fillRect(Math.random() * w, h * (0.5 + Math.random() * 0.4), 20 + Math.random() * 50, 2);
    });
  },

  // Pared del túnel de Mónaco (se usa como luz propia, emissiveMap): penumbra naranja de las lámparas de sodio, con
  // franjas horizontales de reflejo (vídeo 53-58 s) y juntas verticales de los paneles. Arriba = techo
  paredTunel() {
    return this._crear('paredTunel', 128, 128, (g, w, h) => {
      g.fillStyle = '#2c1b0c'; g.fillRect(0, 0, w, h);
      const banda = (y0, y1, c) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0); };
      banda(h * 0.5, h * 0.75, '#b9773a');  // reflejo fuerte a media altura de la pared (lienzo: arriba = techo)
      banda(h * 0.2, h * 0.35, '#7a4a20');
      banda(h * 0.04, h * 0.12, '#5a3616');
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
      g.fillStyle = '#120a04'; g.fillRect(0, h * 0.9, w, h * 0.1); // zócalo sucio
      this._ruido(g, w, h, 600, ['rgba(0,0,0,0.25)', 'rgba(255,190,120,0.08)'], 2);
    });
  },

  // Persiana metálica de garaje (circuitos.js → edificioBoxes: 'monaco'): lamas grises horizontales y marco
  persiana() {
    return this._crear('persiana', 128, 128, (g, w, h) => {
      g.fillStyle = '#b7bcc0'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) { g.fillStyle = '#9aa0a5'; g.fillRect(0, y, w, 2); g.fillStyle = '#d3d7da'; g.fillRect(0, y + 2, w, 1); }
      g.fillStyle = '#8c9297'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 6);
    });
  },

  cartelDistancia(n, fondo = '#0a3d91', color = '#fff') { // (Mónaco: blanco con número negro)
    return this._crear('dist' + n + fondo, 64, 64, (g, w, h) => {
      g.fillStyle = fondo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = 'bold 30px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), w / 2, h / 2 + 1);
    }, { repetir: false });
  },

  // (Interlagos) Morro de la entrada de boxes: franjas en V negras y amarillas (vídeo 70 s)
  chevron() {
    return this._crear('chevron', 128, 64, (g, w, h) => {
      g.fillStyle = '#f2c500'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111111';
      for (let x = -64; x < w + 64; x += 32) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 14 + 20, h / 2); g.lineTo(x + 14, h); g.lineTo(x, h); g.lineTo(x + 20, h / 2); g.closePath(); g.fill();
      }
    });
  },

  // (Interlagos) Fachada de cristal del edificio de boxes: paños azulados con montantes blancos y forjados
  // (un piso de 4 m por repetición vertical; vídeo 2,5-3,5 s)
  cristalBoxes() {
    return this._crear('cristalBoxes', 128, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc3dc'); gr.addColorStop(0.6, '#5f86a3'); gr.addColorStop(1, '#3f5f78');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, h * 0.25); // reflejo del cielo arriba
      g.fillStyle = '#e9ecee';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);   // montantes
      g.fillRect(0, h - 14, w, 14);                             // canto del forjado
      g.fillStyle = '#c9ced2'; g.fillRect(0, h - 16, w, 2);
    });
  },

  // (Interlagos, skyline de São Paulo) Torre de viviendas: una fila de ventanas por piso, con franja de
  // balcones clara y alguna ventana con reflejo. 1 repetición = 4 pisos de alto y ~16 m de ancho
  ventanasResidencial() {
    return this._crear('ventanasResidencial', 64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        for (let x = 3; x < w; x += 8) { g.fillStyle = Math.random() < 0.4 ? '#b4c4d0' : '#7a8794'; g.fillRect(x, y + 5, 4, 6); } // (de lejos tienen que seguir viéndose blancas)
        g.fillStyle = '#d9d9d6'; g.fillRect(0, y + 12, w, 3); // balcón / forjado
      }
    });
  },
};
