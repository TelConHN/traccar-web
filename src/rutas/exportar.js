// Exportar la jornada.
//
// Todo se arma en el navegador con los datos que la pantalla ya tiene cargados. Ninguna
// dependencia nueva: Excel sale por el mismo `exportExcel` que usan los reportes de Traccar,
// y el resto es texto. El servidor no participa, así que no hay un endpoint más que proteger
// ni memoria que se pueda agotar generando archivos.
//
// Dos destinatarios distintos, a propósito:
//   - Excel y CSV son para el dueño de la flota: plan contra realidad, atrasos, kilómetros.
//   - El KML es para abrir el recorrido en Google Earth.
// El comprobante para el cliente final se imprime desde la pantalla (window.print), porque
// ahí lo que importa es el papel, no la hoja de cálculo.
import { saveAs } from 'file-saver';
import exportExcel from '../common/util/exportExcel';

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '';

const ESTADO = {
  pendiente: 'Pendiente',
  en_sitio: 'En el punto',
  visitada: 'Visitada',
  entregado: 'Entregado',
  no_entregado: 'No se pudo',
};

// Una fila por parada, con los nombres de columna que va a leer una persona — no los del
// modelo de datos.
const filas = (cumplimiento) =>
  cumplimiento.paradas.map((p) => ({
    Orden: p.orden,
    Punto: p.punto.nombre,
    Planificada: hora(p.horaEstimada),
    Llegada: hora(p.horaLlegada),
    // Qué la confirmó. Sin esta columna, una llegada «de las 10:31» no se puede discutir.
    'Llegada confirmada por':
      {
        motor_apagado: 'Motor apagado',
        estacionado: 'Estacionado',
        conductor: 'Conductor',
      }[p.llegadaPor] ?? '',
    Salida: hora(p.horaSalida),
    'Minutos en sitio': p.minutosEnSitio ?? '',
    'Atraso (min)': p.minutosAtraso > 0 ? p.minutosAtraso : '',
    // Separadas a propósito: «Llegada» la puso el GPS del vehículo, «Confirmó» una persona.
    // Un reporte que las mezcle no sirve para reclamarle a nadie.
    Confirmó: p.confirmada ? hora(p.confirmadaEn) : 'No confirmó',
    Estado: ESTADO[p.estado] ?? p.estado,
  }));

// Marca de orden de bytes. Se arma con fromCharCode y no como literal: prettier convierte
// el escape en el caracter invisible de verdad, y ahi el linter lo rechaza por «espacio
// irregular» — con razon, porque en el codigo fuente deja de verse.
const BOM = String.fromCharCode(0xfeff);

// Fin de línea CRLF: es el que espera Excel en Windows al abrir un CSV. Se arma con códigos
// por la misma razón que el BOM — un carácter de control escrito literal se vuelve invisible
// en el archivo fuente y nadie entiende después qué hay ahí.
const SALTO = String.fromCharCode(13, 10);

const nombreArchivo = (jornada, extension) =>
  `jornada-${jornada.fecha}-${jornada.id.slice(0, 8)}.${extension}`;

export const exportarExcel = (jornada, cumplimiento, theme) =>
  exportExcel(
    `Jornada del ${jornada.fecha}`,
    nombreArchivo(jornada, 'xlsx'),
    new Map([['Paradas', filas(cumplimiento)]]),
    theme,
  );

export const exportarCsv = (jornada, cumplimiento) => {
  const datos = filas(cumplimiento);
  // Se citan todas las celdas y se duplican las comillas internas: un nombre como
  // «Ferretería "El Sol", centro» partiría la fila en dos columnas sin esto.
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [
    Object.keys(datos[0]).map(celda).join(','),
    ...datos.map((f) => Object.values(f).map(celda).join(',')),
  ];
  // El BOM hace que Excel en Windows abra el archivo como UTF-8; sin él, «Másica» se ve
  // como «MÃ¡sica» y el cliente cree que el sistema está roto.
  saveAs(
    new Blob([BOM + lineas.join(SALTO)], { type: 'text/csv;charset=utf-8' }),
    nombreArchivo(jornada, 'csv'),
  );
};

export const exportarKml = (jornada, cumplimiento, coordenadas) => {
  const escapar = (t) =>
    String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  // KML va en lon,lat — al revés de como se escribe una coordenada. Mismo tropiezo que con
  // el motor de ruteo y con las geocercas, con otro disfraz.
  const linea = coordenadas.map(([lon, lat]) => `${lon},${lat}`).join(' ');

  const paradas = cumplimiento.paradas
    .map(
      (p) => `    <Placemark>
      <name>${escapar(`${p.orden}. ${p.punto.nombre}`)}</name>
      <description>${escapar(
        `Planificada ${hora(p.horaEstimada)} · Llegada ${hora(p.horaLlegada) || 'sin registrar'}`,
      )}</description>
      <Point><coordinates>${p.punto.longitud},${p.punto.latitud}</coordinates></Point>
    </Placemark>`,
    )
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapar(`Jornada del ${jornada.fecha}`)}</name>
${paradas}
    <Placemark>
      <name>Recorrido planificado</name>
      <LineString><tessellate>1</tessellate><coordinates>${linea}</coordinates></LineString>
    </Placemark>
  </Document>
</kml>`;

  saveAs(
    new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
    nombreArchivo(jornada, 'kml'),
  );
};
