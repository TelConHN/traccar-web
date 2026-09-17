// Recortar una línea `[[lat, lon]]` entre dos metros, en el navegador. Es la misma cuenta que
// rutas-api/src/transporte/geometria.js (plano local en metros): acá solo hace falta para dibujar
// los tramos de velocidad de colores sobre el recorrido.
const rad = (g) => (g * Math.PI) / 180;

export const prepararLinea = (linea) => {
  const lat0 = linea[0][0];
  const kLat = 110540;
  const kLon = 111320 * Math.cos(rad(lat0));
  const acumulado = [0];
  for (let i = 1; i < linea.length; i += 1) {
    const dx = (linea[i][1] - linea[i - 1][1]) * kLon;
    const dy = (linea[i][0] - linea[i - 1][0]) * kLat;
    acumulado.push(acumulado[i - 1] + Math.hypot(dx, dy));
  }
  return { linea, acumulado, metros: acumulado[acumulado.length - 1] };
};

const puntoEn = ({ linea, acumulado, metros }, metro) => {
  const m = Math.max(0, Math.min(metros, metro));
  let i = 1;
  while (i < acumulado.length - 1 && acumulado[i] < m) i += 1;
  const largo = acumulado[i] - acumulado[i - 1];
  const t = largo === 0 ? 0 : (m - acumulado[i - 1]) / largo;
  return [
    linea[i - 1][0] + t * (linea[i][0] - linea[i - 1][0]),
    linea[i - 1][1] + t * (linea[i][1] - linea[i - 1][1]),
  ];
};

export const recortar = (preparada, desde, hasta) => {
  if (!preparada || preparada.linea.length < 2) return [];
  const salida = [puntoEn(preparada, desde)];
  preparada.linea.forEach((p, i) => {
    if (preparada.acumulado[i] > desde && preparada.acumulado[i] < hasta) salida.push(p);
  });
  salida.push(puntoEn(preparada, hasta));
  return salida;
};

/// Color por límite: más lento, más cálido. Se lee de un vistazo en el mapa.
export const colorDeLimite = (kmh) => {
  if (kmh <= 30) return '#b91c1c';
  if (kmh <= 50) return '#ea580c';
  if (kmh <= 60) return '#ca8a04';
  if (kmh <= 80) return '#2563eb';
  return '#7c3aed';
};

// ── Dibujar un recorrido (EditorTrazo) ──────────────────────────────────────

const plano = (lat0) => ({ kLat: 110540, kLon: 111320 * Math.cos(rad(lat0)) });

/// Dónde cae `[lat, lon]` sobre la línea preparada: `{ metro, distancia }`. `desdeMetro` salta los
/// segmentos anteriores (una avenida que el recorrido usa dos veces).
export const metroSobre = ({ linea, acumulado }, [lat, lon], desdeMetro = -Infinity) => {
  const { kLat, kLon } = plano(linea[0][0]);
  let mejor = { metro: 0, distancia: Infinity };
  for (let i = 1; i < linea.length; i += 1) {
    if (acumulado[i] < desdeMetro) continue;
    const ax = (linea[i - 1][1] - lon) * kLon;
    const ay = (linea[i - 1][0] - lat) * kLat;
    const bx = (linea[i][1] - lon) * kLon;
    const by = (linea[i][0] - lat) * kLat;
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < mejor.distancia)
      mejor = { metro: acumulado[i - 1] + t * Math.sqrt(largo2), distancia: d };
  }
  return mejor;
};

/// Un punto cada `cada` metros sobre la línea, incluidos el primero y el último.
export const muestrear = (linea, cada) => {
  const preparada = prepararLinea(linea);
  const salida = [];
  for (let m = 0; m < preparada.metros; m += cada) salida.push(puntoEn(preparada, m));
  salida.push(linea[linea.length - 1]);
  return salida;
};
