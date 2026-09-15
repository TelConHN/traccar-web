// Las secciones de Transporte, en un solo lugar.
//
// El menú de la izquierda y la página leen esta misma lista: si cada uno tuviera la suya, tarde o
// temprano el menú ofrecería una sección que la página no conoce.
//
// Algunos títulos dependen de la operación de la cuenta: «Pasajeros» se llama «Estudiantes» en
// una escuela y «Colaboradores» en una empresa, y no existe en una ruta pública. Una sección que no
// aplica no se muestra apagada: se quita, porque un botón que nunca sirve enseña a no mirar el menú.
//
// `descripcion` es lo que la sección le promete a quien la abre: se muestra mientras está vacía,
// en vez de una tabla sin filas que no explica para qué sirve.
import { OPERACIONES } from './operaciones';

const GRUPOS = [
  [
    {
      clave: 'hoy',
      ruta: '/transporte',
      titulo: () => 'Hoy',
      descripcion: () => 'Dónde va cada bus ahora mismo, sobre su recorrido.',
    },
  ],
  [
    {
      clave: 'recorridos',
      ruta: '/transporte/recorridos',
      titulo: () => 'Recorridos',
      descripcion: () =>
        'Tus recorridos con sus paradas. Uno nuevo se crea grabando un viaje que el bus ya hizo: no hay que dibujar nada.',
    },
    {
      clave: 'horarios',
      ruta: '/transporte/horarios',
      titulo: () => 'Horarios',
      descripcion: () =>
        'Qué bus y qué conductor hacen cada recorrido y a qué hora, en una línea de tiempo del día.',
    },
    {
      clave: 'pasajeros',
      ruta: '/transporte/pasajeros',
      existe: (op) => Boolean(op?.pasajeros),
      titulo: (op) => op?.pasajeros?.plural ?? 'Pasajeros',
      descripcion: (op) =>
        `Cada ${op?.pasajeros?.singular ?? 'pasajero'} con su bus y su parada. Se cargan uno por uno o con un Excel.`,
    },
    {
      clave: 'conductores',
      ruta: '/transporte/conductores',
      titulo: () => 'Conductores',
      descripcion: () =>
        'Los conductores y coordinadores de tu cuenta, con qué bus y qué horario tiene cada uno.',
    },
  ],
  [
    {
      clave: 'compartir',
      ruta: '/transporte/compartir',
      titulo: () => 'Compartir seguimiento',
      descripcion: (op) =>
        op?.pasajeros
          ? `Enlaces para ver el bus sin usuario ni contraseña: uno por ${op.pasajeros.singular}, o uno para una empresa o supervisor que vea todos sus buses. Cada enlace muestra solo lo suyo y solo en horario de ruta.`
          : 'Un enlace público por recorrido para que cualquiera vea por dónde viene el bus. Para pegar en redes o en un código QR en las paradas.',
    },
    {
      clave: 'alertas',
      ruta: '/transporte/alertas',
      titulo: () => 'Alertas',
      descripcion: () =>
        'Desvíos, paradas saltadas y excesos de velocidad, cada uno con lo que pasó dibujado en el mapa.',
    },
    {
      clave: 'reportes',
      ruta: '/transporte/reportes',
      titulo: () => 'Reportes',
      descripcion: () =>
        'Cumplimiento por bus, por conductor y por recorrido, para exportar o imprimir.',
    },
    {
      clave: 'equipos',
      ruta: '/transporte/equipos',
      titulo: () => 'Equipos GPS',
      descripcion: () =>
        'Si el GPS de cada bus reporta con la frecuencia necesaria, y qué funciones tiene disponibles por eso.',
    },
  ],
  [
    {
      clave: 'configuracion',
      ruta: '/transporte/configuracion',
      titulo: () => 'Configuración',
      descripcion: () => 'Qué tipo de transporte manejás.',
    },
  ],
];

const TODAS = GRUPOS.flat();

/// Las secciones que existen para esta operación, agrupadas, con el título ya resuelto.
export const seccionesVisibles = (operacion) => {
  const op = OPERACIONES[operacion];
  return GRUPOS.map((grupo) =>
    grupo
      .filter((s) => !s.existe || s.existe(op))
      .map((s) => ({ ...s, titulo: s.titulo(op), descripcion: s.descripcion(op) })),
  ).filter((grupo) => grupo.length > 0);
};

/// La sección que pide la dirección. Sale de la dirección y no de un estado propio: así el botón
/// de atrás y un enlace copiado funcionan, y el menú y la página nunca se contradicen.
export const seccionDe = (pathname) =>
  TODAS.find((s) => (s.clave === 'hoy' ? pathname === s.ruta : pathname.startsWith(s.ruta))) ??
  TODAS[0];

/// ¿Existe esta sección para esta operación?
export const existeSeccion = (seccion, operacion) =>
  !seccion.existe || seccion.existe(OPERACIONES[operacion]);

export const rutaDe = (clave) => TODAS.find((s) => s.clave === clave)?.ruta ?? '/transporte';
