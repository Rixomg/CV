/* ============================================================
   (24-11) VISTA 3D DEL CV — Jerez con el motor de Box Box
   ------------------------------------------------------------
   Monta la escena (Trazado + ConstructorPista + Entorno + ModeloCoche)
   dentro de un contenedor y mueve un coche por la vuelta.
   Uso desde index.html:
     const v = Vista3D.crear(contenedor, { paradas, alPulsarParada, alPulsarMeta });
     v.irA(f)          → el coche conduce hasta la fracción f de la vuelta (0 = meta, 1 = vuelta completa)
     v.curvas(true)    → muestra los nombres de las curvas (easter egg)
     v.activa(i)       → marca la parada i como la actual
   Si WebGL falla, Vista3D.crear lanza un error y el CV se queda con el mapa 2D.
   ============================================================ */

const Vista3D = {
  // ---------- AJUSTES (se pueden tocar) ----------
  AJUSTES: {
    camara: 'onboard', // (24-11) 'persecucion' (detrás del coche) u 'onboard' (desde el casco, como la de 1989)
    onboard: { altura: 1.05, adelante: -0.35, mirar: 30 }, // metros: altura del casco, posición en el coche y punto al que mira
    camaraDetras: 11,      // metros detrás del coche
    camaraAltura: 4.2,     // metros sobre la pista
    mirarDelante: 18,      // metros por delante del coche a los que mira la cámara
    fov: 55,
    // (24-11) HACIA DELANTE el coche va a la velocidad de un F1 de verdad en cada punto (perfil del motor de Box Box:
    // frena en las curvas, acelera en las rectas), arrancando y parando con suavidad. Antes iba a ×4-×8
    ritmo: 1.0,            // 1 = velocidad real; 1,5 = un 50 % más rápido
    aceleracion: 12,       // m/s² al arrancar desde la parada (un F1: ~1,2 g)
    frenada: 30,           // m/s² al parar en la siguiente parada (un F1 frena a 3-5 g)
    segundosMax: 20,       // si un tramo tardaría más que esto a ritmo real, se acelera lo justo para que dure esto
    segundosAtras: 1.8,    // vuelta atrás: la cámara sube, retrocede y baja (sin marcha atrás)
    alturaAtras: 170,      // altura máxima (m) de la cámara al volver atrás
    etiquetasCerca: 300,   // (24-11) las etiquetas (🏁, tabanco) salen cuando el coche está a menos de esto (m)
    mirar: { maxLado: 2.2, maxArriba: 0.35, maxAbajo: 0.5, sensibilidad: 0.006, volverTras: 2.5 }, // (24-11) mirar alrededor arrastrando: radianes, y segundos sin tocar hasta que la vista vuelve al frente
    // (24-11) CARTELES DE PATROCINIO de las paradas: fondo y letra de cada uno (estilo de los carteles de 1989)
    carteles: {
      estilos: [['#f2e21a', '#151515'], ['#d4141c', '#ffffff'], ['#1d3f9a', '#ffffff'], ['#0d6b2c', '#f2e21a'], ['#ffffff', '#d4141c'], ['#151515', '#e8c34a']],
      delante: 35,    // metros por delante de la parada (para verlo al llegar y al estar parado)
      ancho: 14, alto: 3.4, elevacion: 2.2, separacion: 7,
    },
    tabancoEntre: [1, 2],  // (24-11) el tabanco va a mitad de camino entre estas dos paradas (1 = Física, 2 = Máster)
    tabancoVelocidad: 22,  // m/s (~80 km/h) al pasar por delante del tabanco, para que dé tiempo a verlo
    tabancoTramo: 60,      // metros antes y después del tabanco a esa velocidad
  },

  // (24-11) Textura de un cartel de patrocinio: nombre grande y año, con los colores de un patrocinador
  _texCartel(nombre, anio, fondo, color) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 248;
    const g = cv.getContext('2d');
    g.fillStyle = fondo; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = color; g.lineWidth = 10; g.strokeRect(14, 14, cv.width - 28, cv.height - 28);
    g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left';
    const fN = 'italic 900 150px "Titillium Web", "Arial Black", Impact, sans-serif', fA = 'italic 700 90px "Titillium Web", Arial, sans-serif';
    g.font = fN; const aN = g.measureText(nombre).width;
    g.font = fA; const aA = anio ? g.measureText(anio).width : 0;
    const hueco = anio ? 60 : 0, total = aN + hueco + aA, esc = Math.min(1, (cv.width - 90) / total);
    g.save(); g.translate(cv.width / 2, cv.height / 2 + 6); g.scale(esc, 1);
    const x = -total / 2;
    g.font = fN; g.fillText(nombre, x, 0);
    if (anio) { g.font = fA; g.globalAlpha = 0.85; g.fillText(anio, x + aN + hueco, 8); }
    g.restore();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  },

  crear(contenedor, opciones) {
    const A = this.AJUSTES;
    const movil = matchMedia('(pointer: coarse)').matches || innerWidth < 900;

    // ----- Renderer (si WebGL no está, esto lanza y el CV usa el 2D) -----
    const canvas = document.createElement('canvas');
    canvas.className = 'v3d';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !movil, powerPreference: movil ? 'default' : 'high-performance' });
    if (!renderer.getContext()) throw new Error('Sin WebGL');
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, movil ? 1.25 : 1.5));
    renderer.shadowMap.enabled = !movil;                 // (24-11) en el móvil, sin sombras: va mucho más fluido
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    contenedor.appendChild(canvas);

    // ----- Circuito: las mismas piezas que el juego -----
    const escena = new THREE.Scene();
    const t = new Trazado(CIRCUITO_JEREZ);
    const pista = new ConstructorPista(t);
    escena.add(pista.grupo);
    const entorno = new Entorno(escena, t, pista);
    entorno.sol.castShadow = !movil;
    entorno.aplicarCalidad({ resolucionSombras: 1024, sombrasArboles: false });
    if (movil) escena.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const clima = { lluvia: 0, nubes: 0, humedad: 0 };
    if (typeof Jerez1989 !== 'undefined') Jerez1989.decorar(escena, t, pista, movil); // (24-11) decorado de la onboard de 1989

    // ----- Coche (rojo, como el del 2D) -----
    const equipo = { id: 'cv', nombre: 'CV', colores: { principal: '#e10600', secundario: '#ffffff', acento: '#15151a' } };
    const coche = ModeloCoche.crear(equipo, { codigo: 'RMA', numero: 26, apellido: 'Martín', casco: '#e10600' }, 0);
    escena.add(coche.grupo);
    coche.grupo.traverse((o) => { if (o.isMesh) o.castShadow = !movil; });

    const camara = new THREE.PerspectiveCamera(A.fov, 1, 0.3, CONFIG.graficos.distanciaVision);
    Vista3D._depurar = { escena, camara, t, pista, renderer }; // (24-11) solo para inspeccionar desde la consola
    const L = t.L;

    // ----- Línea de meta pulsable (caja invisible) -----
    const m0 = t.muestra(0, {});
    const meta = new THREE.Mesh(new THREE.BoxGeometry(t.hwArr[0] * 2 + 6, 4, 10), new THREE.MeshBasicMaterial({ visible: false }));
    meta.position.set(m0.x, m0.y + 1, m0.z);
    meta.rotation.y = Math.atan2(m0.tx, m0.tz);
    escena.add(meta);

    // ----- Etiquetas HTML encima del canvas (paradas, meta, curvas) -----
    const capa = document.createElement('div');
    capa.className = 'v3d-capa';
    contenedor.appendChild(capa);
    const etiquetas = [];
    const etiqueta = (s, html, clase, alPulsar, alto = 3) => {
      const e = document.createElement(alPulsar ? 'button' : 'span');
      if (alPulsar) { e.type = 'button'; e.addEventListener('click', alPulsar); }
      e.className = 'v3d-et ' + clase;
      e.innerHTML = html;
      capa.appendChild(e);
      const m = t.muestra(s, {});
      const obj = { e, p: new THREE.Vector3(m.x, m.y + alto, m.z), s };
      etiquetas.push(obj);
      return obj;
    };
    // (24-11) Cada parada es un CARTEL DE PATROCINIO 3D junto a la pista (antes, una etiqueta digital). Se pulsa para ir.
    // La Parrilla y la Meta caen junto a la línea, igual que Física: van antes de la línea y cada uno a un lado
    const CA = A.carteles, carteles = [];
    const libreEn = (x, z) => t.distanciaPista(x, z) > t.hw + 4;
    opciones.paradas.forEach((pa, i) => {
      const esMeta = pa.f >= 0.999, esParrilla = pa.f < 0;
      const sC = esMeta ? -45 : pa.f * L + (esParrilla ? 30 : CA.delante);
      let lado = esMeta ? -1 : (i % 2 ? 1 : -1);
      const i0 = t.indice(sC), m0 = t.muestra(sC, {});
      let lat = lado * (t.hwArr[i0] + CA.separacion);
      if (!libreEn(m0.x + m0.nx * lat, m0.z + m0.nz * lat)) { lado = -lado; lat = -lat; } // si pisa otro tramo, al otro lado
      const [fondo, color] = CA.estilos[i % CA.estilos.length];
      const tex = Vista3D._texCartel(pa.nombre.toUpperCase(), pa.anio || '', fondo, color);
      const liso = new THREE.MeshLambertMaterial({ color: fondo });
      // cara de delante (+z de la caja) con el texto; el resto, del color de fondo
      const panel = new THREE.Mesh(new THREE.BoxGeometry(CA.ancho, CA.alto, 0.3), [liso, liso, liso, liso, new THREE.MeshLambertMaterial({ map: tex }), liso]);
      const g = new THREE.Group();
      g.position.set(m0.x + m0.nx * lat, m0.y, m0.z + m0.nz * lat);
      g.rotation.y = Math.atan2(-m0.tx, -m0.tz) - lado * 0.45; // de cara a los coches que llegan, algo girado hacia la pista
      panel.position.y = CA.elevacion + CA.alto / 2;
      g.add(panel);
      const gris = new THREE.MeshLambertMaterial({ color: '#555a60' });
      for (const fx of [-0.38, 0.38]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.3, CA.elevacion, 0.3), gris); po.position.set(fx * CA.ancho, CA.elevacion / 2, 0); g.add(po); }
      g.userData.parada = i;
      escena.add(g);
      carteles.push(g);
    });
    etiqueta(0, '🏁', 'meta', () => opciones.alPulsarMeta(), 1.5).e.title = '¿Qué circuito es?';

    // ----- (24-11) TABANCO (el huevo de pascua de la copa) -----
    // El modelo está en motor/tabanco3d.js. Está A MITAD DE CAMINO entre dos paradas (A.tabancoEntre: Física y Máster)
    // y solo se ve / se puede pulsar al pasar por delante: el coche frena al llegar (A.tabancoVelocidad) para que dé tiempo
    const iT = A.tabancoEntre, fT = (opciones.paradas[iT[0]].f + opciones.paradas[iT[1]].f) / 2;
    const TAB = { s: fT * L, lado: -1, separacion: 10 }; // metros desde la meta, lado (-1 = derecha) y metros desde el borde
    {
      // si a la derecha cae encima de otro tramo de pista, se pone a la izquierda
      const mt = t.muestra(TAB.s, {}), lat = TAB.lado * (t.hwArr[t.indice(TAB.s)] + TAB.separacion);
      if (t.distanciaPista(mt.x + mt.nx * lat, mt.z + mt.nz * lat) < t.hw + 14) TAB.lado = -TAB.lado;
    }
    const tabanco = Tabanco3D.crear();
    {
      const mt = t.muestra(TAB.s, {}), lat = TAB.lado * (t.hwArr[t.indice(TAB.s)] + TAB.separacion);
      tabanco.position.set(mt.x + mt.nx * lat, mt.y, mt.z + mt.nz * lat);
      tabanco.rotation.y = Math.atan2(-TAB.lado * mt.nx, -TAB.lado * mt.nz) - TAB.lado * 0.5; // de cara a la pista, algo girado hacia los coches que llegan
      tabanco.visible = false;
      escena.add(tabanco);
    }
    tabanco.visible = true;
    const etTabanco = etiqueta(TAB.s, '¿Una copa? 🍷', 'tabanco', () => opciones.alPulsarTabanco && opciones.alPulsarTabanco(), 6.5);
    etTabanco.p.copy(tabanco.position).y += 5.2; // (encima del tabanco, no en medio de la pista)
    let verTabanco = false; // true solo cuando el coche está cerca del tabanco
    const curvas = (window.CURVAS_JEREZ || []).map(([n, s]) => etiqueta(s, n, 'curva', null, 6));
    let verCurvas = false;

    // ----- Estado del coche: s = metros desde la meta (puede ser < 0 en la parrilla) -----
    let s = 0, desde = 0, hasta = 0, t0 = 0, dur = 0, atras = false, moviendo = false, pendientes = 2;
    const cam = new THREE.Vector3(), mira = new THREE.Vector3(), tmp = {}, tmp2 = {};
    const suave = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k); // arranca y frena suave
    // (24-11) Tabla tiempo → distancia de un tramo a velocidad real: v = mín(perfil × ritmo, arrancando, frenando)
    let tablaT = null, tablaV = null, pasoT = 2;
    const prepararTramo = (d) => {
      const n = Math.max(2, Math.ceil(d / pasoT)), T = new Float32Array(n + 1), V = new Float32Array(n + 1);
      const vel = (x, esc) => Math.max(1.5, Math.min(t.valor(t.vRef, desde + x) * A.ritmo * esc, Math.sqrt(2 * A.aceleracion * esc * x + 4), Math.sqrt(2 * A.frenada * esc * (d - x) + 1),
        velTabanco(desde + x)));
      // (24-11) por delante del tabanco va despacio (y frena / acelera de forma real antes y después)
      const velTabanco = (sx) => { const fuera = Math.max(0, Math.abs(sx - TAB.s) - A.tabancoTramo); return Math.sqrt(A.tabancoVelocidad ** 2 + 2 * A.frenada * fuera); };
      const total = (esc) => { let tt = 0; for (let j = 1; j <= n; j++) { const x = (j / n) * d; tt += (d / n) / ((vel(x - d / n / 2, esc))); } return tt; };
      let esc = 1;
      if (total(1) > A.segundosMax) esc = total(1) / A.segundosMax; // tramo muy largo: se acelera lo justo
      for (let j = 1; j <= n; j++) { const x = (j / n) * d; V[j] = vel(x, esc); T[j] = T[j - 1] + (d / n) / vel(x - d / n / 2, esc); }
      tablaT = T; tablaV = V;
      return T[n];
    };

    const posCoche = (sx) => {
      const m = t.muestra(sx, tmp);
      const lat = t.valor(t.linea, sx) * 0.6; // por la trazada, algo hacia el centro
      return { x: m.x + m.nx * lat, z: m.z + m.nz * lat, y: m.y, m };
    };

    // Cámara de persecución detrás del coche (o vista de dron al volver atrás)
    // (24-11) MIRAR ALREDEDOR: arrastrando con el ratón o el dedo se gira la vista; al soltar, a los pocos segundos vuelve al frente
    const vista = { lado: 0, arriba: 0, arrastrando: false, soltado: 0 };
    const girarVista = () => { camara.rotateY(vista.lado); camara.rotateX(vista.arriba); };
    const colocarCamara = (p, alturaExtra) => {
      const m = p.m, dx = m.sx, dz = m.sz;
      if (A.camara === 'onboard' && alturaExtra < 0.5) { // (24-11) desde el casco
        const o = A.onboard, md = t.muestra(s + o.mirar, tmp2), lat = t.valor(t.linea, s + o.mirar) * 0.6;
        camara.position.set(p.x + dx * o.adelante, p.y + o.altura, p.z + dz * o.adelante);
        camara.lookAt(md.x + md.nx * lat, md.y + o.altura * 0.6, md.z + md.nz * lat);
        girarVista();
        return;
      }
      const d = A.camaraDetras + alturaExtra * 0.35;
      cam.set(p.x - dx * d, p.y + A.camaraAltura + alturaExtra, p.z - dz * d);
      const md = t.muestra(s + A.mirarDelante * (1 - Math.min(1, alturaExtra / 40)), tmp2);
      mira.set(md.x, md.y + 1, md.z);
      camara.position.copy(cam);
      camara.lookAt(mira);
      if (alturaExtra < 0.5) girarVista();
    };

    let pausado = false, tPausa = 0;
    const pintar = (ahoraReal) => {
      let alturaExtra = 0, v = 0;
      const ahora = pausado ? tPausa : ahoraReal; // (24-11) en pausa el tiempo del tramo no avanza
      if (moviendo) {
        const k = Math.min(1, (ahora - t0) / dur);
        if (atras) s = desde + (hasta - desde) * suave(k);
        else { // busca en la tabla en qué metro va a este tiempo
          const tt = (ahora - t0) / 1000, T = tablaT, n = T.length - 1;
          let lo = 0, hi = n;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= tt) lo = mid; else hi = mid; }
          const f = T[hi] > T[lo] ? Utils.limitar((tt - T[lo]) / (T[hi] - T[lo]), 0, 1) : 1;
          s = desde + (hasta - desde) * Math.min(1, (lo + f) / n);
          v = pausado ? 0 : tablaV[hi];
        }
        if (atras) alturaExtra = A.alturaAtras * Math.sin(Math.PI * k);
        if (k >= 1) {
          moviendo = false; s = hasta; pendientes = 2;
        }
      }
      verTabanco = s > TAB.s - A.etiquetasCerca && s < TAB.s + 30; // (24-11) el tabanco solo se puede pulsar al pasar por delante
      const p = posCoche(s);
      coche.actualizar({ x: p.x, y: p.y, z: p.z, rumbo: Math.atan2(p.m.sx, p.m.sz), v, aceleracion: 0, curvatura: p.m.k || 0, compuesto: 'S', visible: true }, 1 / 60);
      coche.distancia(A.camaraDetras + alturaExtra);
      colocarCamara(p, alturaExtra);
      entorno.actualizar(1 / 60, camara, coche.grupo.position, clima);
      renderer.render(escena, camara);
      // Etiquetas: se proyectan a la pantalla; las de detrás de la cámara o muy lejos se esconden
      const W = canvas.clientWidth, H = canvas.clientHeight, v3 = new THREE.Vector3();
      for (const o of etiquetas) {
        // (24-11) Las etiquetas solo salen cuando el coche se acerca: de 15 m por detrás a CERCA m por delante.
        // Las paradas usan la distancia "sin dar la vuelta" (la Meta está a 4.426 m, no en la línea de salida)
        let dS = o.s - s;
        if (!o.e.classList.contains('parada')) dS = ((dS % L) + L * 1.5) % L - L / 2;
        const cerca = dS > -15 && dS < (o.e.classList.contains('curva') ? 450 : A.etiquetasCerca);
        const oculta = !cerca || (o.e.classList.contains('curva') && !verCurvas) || (o === etTabanco && !verTabanco);
        v3.copy(o.p).project(camara);
        const dist = o.p.distanceTo(camara.position);
        const fuera = oculta || v3.z > 1 || dist > (o.e.classList.contains('curva') ? 450 : 900) // (24-11) curvas solo las cercanas: en el horizonte se amontonaban
           || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05;
        o.e.style.display = fuera ? 'none' : '';
        if (!fuera) o.e.style.transform = `translate(-50%,-100%) translate(${((v3.x + 1) / 2 * W).toFixed(1)}px,${((1 - v3.y) / 2 * H).toFixed(1)}px)`;
      }
    };

    // Solo se dibuja cuando algo se mueve (ahorra batería en el móvil)
    const bucle = (ahora) => {
      // la vista vuelve sola al frente si hace rato que no se toca
      if (!vista.arrastrando && (vista.lado || vista.arriba) && ahora - vista.soltado > A.mirar.volverTras * 1000) {
        vista.lado *= 0.92; vista.arriba *= 0.92;
        if (Math.abs(vista.lado) + Math.abs(vista.arriba) < 0.002) { vista.lado = 0; vista.arriba = 0; }
        pendientes = Math.max(pendientes, 1);
      }
      if (moviendo || pendientes > 0) { pintar(ahora); if (!moviendo) pendientes--; }
      requestAnimationFrame(bucle);
    };

    const redimensionar = () => {
      const w = contenedor.clientWidth, h = contenedor.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      pendientes = 2;
    };
    new ResizeObserver(redimensionar).observe(contenedor);
    redimensionar();

    // Pulsar la línea de meta (en el 3D) → easter egg. Solo si fue un toque, no un arrastre
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let abajo = null, base = null;
    canvas.addEventListener('pointerdown', (e) => { abajo = [e.clientX, e.clientY]; base = [vista.lado, vista.arriba]; vista.arrastrando = true; });
    canvas.addEventListener('pointermove', (e) => {
      if (vista.arrastrando && abajo) { // arrastrar = girar la vista, "agarrando" la imagen como en Street View
        const M = A.mirar;
        vista.lado = Utils.limitar(base[0] + (e.clientX - abajo[0]) * M.sensibilidad, -M.maxLado, M.maxLado);
        if (e.pointerType === 'mouse') vista.arriba = Utils.limitar(base[1] + (e.clientY - abajo[1]) * M.sensibilidad, -M.maxAbajo, M.maxArriba);
        pendientes = Math.max(pendientes, 2);
        return;
      }
      if (e.pointerType === 'mouse') { // cursor de mano encima de lo que se puede pulsar
        const r = canvas.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, camara);
        const si = ray.intersectObjects(carteles, true).length || (verTabanco && ray.intersectObject(tabanco, true).length);
        canvas.style.cursor = si ? 'pointer' : 'grab';
      }
    });
    const soltar = () => { vista.arrastrando = false; vista.soltado = performance.now(); };
    canvas.addEventListener('pointercancel', () => { soltar(); abajo = null; });
    canvas.addEventListener('pointerleave', () => { if (vista.arrastrando) soltar(); });
    canvas.addEventListener('pointerup', (e) => {
      soltar();
      if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 8) return;
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camara);
      const hc = ray.intersectObjects(carteles, true)[0];
      let o = hc && hc.object; while (o && o.userData.parada === undefined) o = o.parent;
      if (o) opciones.alPulsarParada(o.userData.parada);
      else if (ray.intersectObject(meta).length) opciones.alPulsarMeta();
      else if (verTabanco && ray.intersectObject(tabanco, true).length && opciones.alPulsarTabanco) opciones.alPulsarTabanco();
    });

    requestAnimationFrame(bucle);

    return {
      // Conduce hasta la fracción f de la vuelta. inmediato = sin animación (reducir movimiento / primer pintado)
      irA(f, inmediato) {
        const destino = f * L;
        if (inmediato) { moviendo = false; s = destino; pendientes = 2; return; }
        desde = s; hasta = destino; atras = destino < s - 0.5;
        const d = Math.abs(hasta - desde);
        if (d < 0.5) { pendientes = 2; return; }
        dur = 1000 * (atras ? A.segundosAtras : prepararTramo(d));
        t0 = performance.now();
        moviendo = true;
      },
      curvas(si) { verCurvas = si; pendientes = 2; },
      // (24-11) muestra u oculta el tabanco; pop = aparece creciendo (como el del 2D)
      activa(i) { pendientes = 2; },
      // (24-11) pausa el coche (por ejemplo mientras está abierta la carta del tabanco) y lo reanuda donde iba
      pausar(si) {
        const ahora = performance.now();
        if (si && !pausado) { pausado = true; tPausa = ahora; }
        else if (!si && pausado) { pausado = false; t0 += ahora - tPausa; }
      },
    };
  },
};
