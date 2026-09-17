// Exportar el reporte de Transporte: Excel y CSV, armados en el navegador con lo que la
// pantalla ya tiene, igual que en Rutas. Sin endpoint nuevo ni memoria del servidor.
import { saveAs } from 'file-saver';
import exportExcel from '../common/util/exportExcel';

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '';
const fecha = (iso) => (iso ? String(iso).slice(0, 10) : '');

const filasViajes = (viajes) =>
  viajes.map((v) => ({
    Fecha: fecha(v.fecha),
    Recorrido: v.linea,
    Variante: v.variante,
    Bus: v.vehiculo,
    Conductor: v.conductor ?? '',
    Programado: v.horaInicio,
    Inicio: hora(v.inicioEn),
    Fin: hora(v.finEn),
    Estado: { terminado: 'Terminado', sin_datos: 'Sin datos' }[v.estado] ?? v.estado,
    Equipo:
      {
        completo: 'Completo',
        desvios_y_paradas: 'Desvíos y paradas',
        insuficiente: 'Insuficiente',
      }[v.aptitudNivel] ?? '',
    Paradas: v.paradas,
    'Se detuvo': v.se_detuvo,
    'Sin detenerse': v.paso_sin_detenerse,
    'Sin datos': v.sin_datos,
    'Obligatorias saltadas': v.obligatoriasSaltadas,
    Desvíos: v.desvios,
    'Desvíos autorizados': v.desviosAutorizados,
    Excesos: v.excesos ?? 0,
    'Detenciones fuera de parada': v.detencionesFuera ?? 0,
  }));

const filasGrupo = (grupos, etiqueta) =>
  grupos.map((g) => ({
    [etiqueta]: g.nombre,
    Viajes: g.viajes,
    'Viajes sin datos': g.sinDatos,
    Paradas: g.paradas,
    'Se detuvo': g.seDetuvo,
    'Sin detenerse': g.sinDetenerse,
    'Sin datos': g.paradasSinDatos,
    'Obligatorias saltadas': g.obligatoriasSaltadas,
    Desvíos: g.desvios,
    Excesos: g.excesos ?? 0,
    'Detenciones fuera de parada': g.detencionesFuera ?? 0,
    'Cumplimiento %': g.paradas ? Math.round((g.seDetuvo / g.paradas) * 100) : '',
  }));

const BOM = String.fromCharCode(0xfeff);
const SALTO = String.fromCharCode(13, 10);
const nombre = (r, ext) => `transporte-${r.desde}-a-${r.hasta}.${ext}`;

export const exportarExcelTransporte = (reporte, theme) =>
  exportExcel(
    `Transporte del ${reporte.desde} al ${reporte.hasta}`,
    nombre(reporte, 'xlsx'),
    new Map([
      ['Por recorrido', filasGrupo(reporte.porLinea, 'Recorrido')],
      ['Por bus', filasGrupo(reporte.porBus, 'Bus')],
      ['Por conductor', filasGrupo(reporte.porConductor, 'Conductor')],
      ['Viajes', filasViajes(reporte.viajes)],
    ]),
    theme,
  );

export const exportarCsvTransporte = (reporte) => {
  const filas = filasViajes(reporte.viajes);
  if (filas.length === 0) return;
  const columnas = Object.keys(filas[0]);
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texto = [
    columnas.join(','),
    ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(',')),
  ].join(SALTO);
  saveAs(new Blob([BOM + texto], { type: 'text/csv;charset=utf-8' }), nombre(reporte, 'csv'));
};
