/* ============================================================
   UTILIDADES — funciones pequeñas usadas en todo el juego
   ============================================================ */

const Utils = {
  limitar(v, min, max) {
    return v < min ? min : v > max ? max : v;
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  // Transición suave de 0 a 1 entre e0 y e1
  suave(e0, e1, x) {
    const t = Utils.limitar((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  aleatorio(min, max) {
    return min + Math.random() * (max - min);
  },

  aleatorioEntero(min, max) {
    return Math.floor(Utils.aleatorio(min, max + 1));
  },

  elegir(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
  },

  // Número aleatorio con forma de campana (media 0, desviación 1)
  gaussiana() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },

  // Generador aleatorio con semilla: el mismo número da siempre el mismo
  // resultado (así los árboles y tribunas salen siempre en el mismo sitio)
  semilla(n) {
    let a = n >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // Lleva s al rango [0, L)
  envolver(s, L) {
    return ((s % L) + L) % L;
  },

  // Pinta cada carta pequeña (.cartaMini, .cartaTorre) con el color de su nivel según su número
  colorearCartas(raiz = document) {
    raiz.querySelectorAll('.cartaMini, .cartaTorre').forEach((e) => {
      const v = parseInt(e.textContent, 10);
      if (!isFinite(v)) return;
      e.classList.remove('nBronce', 'nPlata', 'nOro', 'nPlatino');
      e.classList.add(v >= 96 ? 'nPlatino' : v >= 85 ? 'nOro' : v >= 70 ? 'nPlata' : 'nBronce');
    });
  },

  // DAÑOS VISIBLES de un coche → un número (para dibujarlos y grabarlos en las repeticiones)
  // fa: alerón delantero (0 nada, 1 media ala colgando, 2 media ala arrancada, 3 todo torcido y bajo, 4 sin alerón) · fl: su lado
  // ta: alerón trasero (0, 1 sin flap, 2 caído hacia un lado, 3 sin una deriva, 4 arrancado) · tl: su lado
  // rueda: pinchada (0, 1 del. izq., 2 del. der., 3 tras. izq., 4 tras. der.) · ponton: 1 izq. / −1 der. · susp: rueda con la suspensión rota
  // (lado: 1 = izquierda del coche, −1 = derecha)
  codigoDaños(c) {
    const v = c.dv || (c.dv = {});
    const fa = c.aleronRoto ? v.fa || 3 : 0, ta = c.aleronTraseroRoto ? v.ta || 2 : 0;
    const rueda = c.pinchazo ? v.rueda || (v.rueda = 1 + Math.floor(Math.random() * 4)) : 0;
    const susp = c.suspensionRota ? v.susp || rueda || (v.susp = 1 + Math.floor(Math.random() * 4)) : 0;
    return fa + 5 * (v.fl < 0 ? 0 : 1) + 10 * ta + 50 * (v.tl < 0 ? 0 : 1) + 100 * rueda + 500 * (c.pontonRoto ? (v.ponton < 0 ? 2 : 1) : 0) + 1500 * susp;
  },

  leerDaños(n) {
    n = Math.round(n || 0);
    return { fa: n % 5, fl: Math.floor(n / 5) % 2 ? 1 : -1, ta: Math.floor(n / 10) % 5, tl: Math.floor(n / 50) % 2 ? 1 : -1,
      rueda: Math.floor(n / 100) % 5, ponton: [0, 1, -1][Math.floor(n / 500) % 3], susp: Math.floor(n / 1500) % 5 };
  },

  // Ángulo llevado a (−π, π] (465° y 105° son el mismo: así no da una vuelta de más)
  angulo(a) {
    return Math.PI - Utils.envolver(Math.PI - a, Math.PI * 2);
  },

  // Mezcla dos ángulos por el camino corto (f: 0 … 1)
  mezclarAngulo(a, b, f) {
    return a + Utils.angulo(b - a) * f;
  },

  // 81.4567 → "1:21.457"
  tiempo(seg) {
    if (!isFinite(seg) || seg <= 0) return '--:--.---';
    const m = Math.floor(seg / 60);
    const s = seg - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  },

  // Diferencia: "+1.234"
  diferencia(seg) {
    if (!isFinite(seg)) return '';
    return (seg >= 0 ? '+' : '-') + Math.abs(seg).toFixed(seg >= 100 ? 1 : 3);
  },

  kmh(ms) {
    return Math.round(ms * 3.6);
  },

  hexA_rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
};

/* ------------------------------------------------------------
   GUARDADO — la temporada se guarda en el navegador.
   Va con try/catch porque en modo incógnito puede fallar.
   ------------------------------------------------------------ */
const Guardado = {
  leer(clave, porDefecto = null) {
    try {
      const v = localStorage.getItem('boxbox.' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) {
      return porDefecto;
    }
  },

  escribir(clave, valor) {
    try {
      localStorage.setItem('boxbox.' + clave, JSON.stringify(valor));
    } catch (e) {
      /* sin guardado: el juego sigue funcionando */
    }
  },

  borrar(clave) {
    try {
      localStorage.removeItem('boxbox.' + clave);
    } catch (e) { /* nada */ }
  },
};
