/* ============================================================
   (24-11) CONFIGURACIÓN MÍNIMA DEL MOTOR DE BOX BOX PARA EL CV
   ------------------------------------------------------------
   El motor (trazado.js, constructorPista.js, entorno.js...) es una
   copia de Box Box (NovoJogo/js). Aquí solo van los ajustes que
   esas piezas leen, con los mismos valores que en NovoJogo/js/config.js.
   Lo que se puede tocar a mano está en CIRCUITO_JEREZ (más abajo).
   ============================================================ */

const CONFIG = {
  fisica: { gravedad: 9.81, velocidadMax: 96, aceleracionBase: 15, agarreBase: 2.0, agarreAero: 0.0007, frenadaBase: 2.2, frenadaAero: 0.00045 },
  carrera: { separacionParrilla: 8, lateralParrilla: 2.6, alisarEje: 4, ejeCurvo: true, alisarLinea: 6 },
  batallas: { facilidadSecundarias: 0.45 },
  boxes: { limiteVelocidad: 22.2, rampa: 130, rampaLateralEntrada: 200, rampaLateralSalida: 200 },
  neumaticos: { S: { color: '#ff2a2a' }, M: { color: '#ffd12a' }, H: { color: '#f2f2f2' } },
  graficos: {
    grosorMuros: 1,
    sombras: true,
    calidad: 'equilibrada',
    distanciaDetalleArboles: 60,
    distanciaVision: 3500,        // (24-11) menos que en el juego (6500): el CV tiene que ir fluido en el móvil
    distanciaDetalleCoche: 90,
    distanciaLejosCoche: 150,
  },
};

// Equipos inventados: solo sirven para pintar los garajes y las marcas del pit lane (el motor los cuenta)
const EQUIPOS = [
  ['rojo', '#e10600', '#ffffff', '#15151a'], ['azul', '#1d4ed8', '#f5c400', '#0b1220'],
  ['verde', '#0b7a43', '#ffffff', '#0a0a0a'], ['naranja', '#ff7a00', '#1b2a4a', '#ffffff'],
  ['plata', '#bfc4cc', '#0aa1a1', '#111111'], ['negro', '#17181c', '#d4af37', '#ffffff'],
  ['celeste', '#6ec1ff', '#ffffff', '#0a2a4a'], ['granate', '#7a1022', '#f2f2f2', '#111111'],
  ['amarillo', '#f5c400', '#111111', '#ffffff'], ['blanco', '#f4f4f4', '#e10600', '#1a1a1a'],
].map(([id, principal, secundario, acento], k) => ({
  id, nombre: id, colores: { principal, secundario, acento },
  pilotos: [{ codigo: 'P' + k, numero: k + 1, apellido: 'Piloto', casco: principal }],
}));

// ===== CIRCUITO DE JEREZ – ÁNGEL NIETO =====
// Trazado: jerez_centreline.json (OpenStreetMap) → motor/jerez_puntos.js (4.426 m, horario, empieza en la meta).
// Llano (el desnivel real es de pocos metros). Ancho 12 m (se cambia en jerez_puntos.js, 3.er valor de cada punto).
// Metros desde la meta de cada curva: window.CURVAS_JEREZ (en jerez_puntos.js).
const CIRCUITO_JEREZ = {
  id: 'jerez',
  nombre: 'Circuito de Jerez',
  pais: 'España',
  longitudReal: 4428,
  desgaste: 1.0,
  densidadArboles: 0.35,     // (24-11, onboard 1989) campiña casi pelada: matorral y algún árbol suelto
  entorno: 'parque',
  cielo: { arriba: '#7c84d8', horizonte: '#e2deec' }, // (24-11) cielo malva y lechoso de la onboard de 1989 (vídeo VHS)
  cesped: '#8c9a4a',         // (24-11) hierba corta verde amarillenta, como en la onboard
  puntos: 'jerez',
  metaEnPrimerPunto: true,
  sinAvisos: true,          // (24-11) calla los avisos del juego (recta de meta corta, pit lane corto): aquí no hay carrera
  anchoExtra: 0,
  umbralCurva: 1 / 180,
  factorVelocidad: 0.95,
  // (24-11) CALLE DE BOXES a la IZQUIERDA de la recta de meta (en la onboard el edificio blanco queda a la izquierda)
  boxesLado: 1,
  edificioBoxes: 'interlagos', // edificio blanco de varias plantas, como el de 1989
  boxesEntrada: -330,
  boxesSalida: 250,
  limitadorPit: 80,
  tribunaRecta: true,        // tribuna principal enfrente de los boxes
  cartelesFrenada: [150, 100, 50],
  tribunasFrenadas: false,
  tribunas: [
    { sIni: 230, sFin: 340, lado: 1, fondo: 18 },    // Expo '92, por fuera
    { sIni: 1990, sFin: 2120, lado: 1, fondo: 18 },  // Dani Pedrosa
    { sIni: 3940, sFin: 4080, lado: 1, fondo: 22 },  // horquilla Lorenzo (la grada grande)
  ],
  nombresCurvas: [],
  zonasAtaque: [
    { nombre: 'Lorenzo', s: 4000, tipo: 'frenada', rectaAntes: 320, rectaSiguiente: 300, facilidad: 0.4 },
    { nombre: "Expo '92", s: 260, tipo: 'frenada', rectaAntes: 300, rectaSiguiente: 200, facilidad: 0.3 },
  ],
  escapatorias: [
    { sIni: 250, sFin: 380, lado: 'izquierda', tipo: 'grava', ancho: 22 },   // Expo '92
    { sIni: 1990, sFin: 2150, lado: 'izquierda', tipo: 'grava', ancho: 18 }, // Dani Pedrosa
    { sIni: 3980, sFin: 4110, lado: 'izquierda', tipo: 'grava', ancho: 22 }, // Lorenzo
  ],
  // (24-11) Pórticos sobre la pista (marca = posición en visual.publicidad): el arco rojo y blanco de la recta
  // de meta y la pancarta amarilla y verde antes de la última curva
  puentes: [{ s: 140, marca: 0, alto: 2.6 }, { s: 3600, marca: 3, alto: 2.4 }],
  publicidadZonas: [{ sIni: 0, sFin: 1500, marca: 0 }, { sIni: 1500, sFin: 3000, marca: 1 }, { sIni: 3000, sFin: 4426, marca: 2 }],
  facilidadSecundarias: 0.04,
  visual: {
    ambiente: false, luzCalida: true, // (24-11) sin neumáticos apilados ni logos en el césped: en 1989 no había
    piano: ['#2f4fb4', '#f2f2f2'],    // (24-11) pianos azules y blancos, como en la onboard
    gravaEn: [],
    franjasCesped: 0,
    distanciaArboles: 45,
    sol: { direccion: [-0.3, 0.85, 0.4], color: '#fff2da', intensidad: 3.1 },
    // (24-11) Carteles con los colores de los de 1989, pero con marcas inventadas (el CV es público).
    // Para poner otros textos, cambiar solo 'texto'
    publicidad: [
      { texto: 'BOX BOX', fondo: '#d4141c', color: '#ffffff' },     // 0: arco rojo y blanco de la recta
      { texto: 'FINO JEREZ', fondo: '#f2e21a', color: '#1a1a1a' },  // 1: pancartas amarillas grandes
      { texto: 'CV 2026', fondo: '#f4f4f4', color: '#1d3f9a' },     // 2: cartel blanco con letras azules
      { texto: 'DATOS · IA', fondo: '#d8e021', color: '#0d6b2c' },  // 3: pancarta amarilla y verde
    ],
  },
};
