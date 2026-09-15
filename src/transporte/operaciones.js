// Los tipos de operación de Transporte y cómo habla la aplicación en cada uno.
//
// Transporte es un servicio para cualquier cliente. Lo que cambia entre una escuela, una empresa
// que lleva a su personal, una ruta pública o un shuttle de hotel son las palabras —quiénes
// viajan, quién sigue el bus— y qué pasos tiene sentido ofrecer. Todo eso vive acá: las pantallas
// no escriben «estudiantes» ni «familias» por su cuenta, se lo preguntan a la operación.
//
// `pasajeros` en null quiere decir que no hay pasajeros registrados (una línea pública): esa
// cuenta no tiene sección de pasajeros y comparte el recorrido completo, no el bus de una persona.

const GRABAR = {
  titulo: 'Grabá tu primer recorrido',
  detalle:
    'Elegí un viaje que el bus ya hizo y lo convertimos en recorrido, con sus paradas. No hay que dibujar nada.',
  seccion: 'recorridos',
};

const ASIGNAR = {
  titulo: 'Asigná bus, conductor y horario',
  detalle:
    'Decí qué bus hace cada recorrido y a qué hora. Desde ese momento, si se sale del camino, te avisamos.',
  seccion: 'horarios',
};

export const OPERACIONES = {
  escolar: {
    nombre: 'Transporte escolar',
    corto: 'Escolar',
    resumen: 'Viajan estudiantes y sus familias siguen el bus desde el teléfono.',
    pasajeros: { plural: 'Estudiantes', singular: 'estudiante' },
    promesa: 'tus buses quedan vigilados y las familias saben dónde va el bus.',
    pasos: [
      GRABAR,
      ASIGNAR,
      {
        titulo: 'Cargá a tus estudiantes',
        detalle:
          'Uno por uno o con un Excel. A cada uno le asignás la parada donde sube y donde baja.',
        seccion: 'pasajeros',
      },
      {
        titulo: 'Compartí el seguimiento con las familias',
        detalle:
          'Cada familia recibe un enlace por WhatsApp para ver el bus de su hijo, solo mientras va en ruta.',
        seccion: 'compartir',
      },
    ],
  },
  personal: {
    nombre: 'Transporte de personal',
    corto: 'Personal de empresa',
    resumen:
      'Llevás a los colaboradores de una o varias empresas. Cada uno sabe cuándo llega su bus, y la empresa ve que el servicio se cumple.',
    pasajeros: { plural: 'Colaboradores', singular: 'colaborador' },
    promesa: 'tus buses quedan vigilados y cada colaborador sabe cuándo llega el suyo.',
    pasos: [
      GRABAR,
      ASIGNAR,
      {
        titulo: 'Cargá a los colaboradores',
        detalle:
          'Con un Excel de la empresa: nombre, turno y parada. Si llevás personal de varias empresas, cada uno queda con la suya.',
        seccion: 'pasajeros',
      },
      {
        titulo: 'Compartí el seguimiento',
        detalle:
          'Cada colaborador recibe su enlace para ver el bus, y la empresa o el supervisor uno para ver todos los buses que la atienden.',
        seccion: 'compartir',
      },
    ],
  },
  linea: {
    nombre: 'Ruta pública o línea',
    corto: 'Ruta pública',
    resumen:
      'Recorridos abiertos a cualquiera, sin pasajeros registrados: buses urbanos, interurbanos o shuttles.',
    pasajeros: null,
    promesa: 'tus buses quedan vigilados: desvíos, paradas y velocidad.',
    pasos: [
      GRABAR,
      ASIGNAR,
      {
        titulo: 'Marcá los límites de velocidad',
        detalle:
          'Tocá dónde empieza y dónde termina un tramo del recorrido y elegí el límite: 60, 80 o el que corresponda.',
        seccion: 'recorridos',
      },
      {
        titulo: 'Publicá el recorrido',
        detalle:
          'Un enlace para que los usuarios vean por dónde viene el bus. Lo pegás en tus redes o en un código QR en las paradas.',
        seccion: 'compartir',
      },
    ],
  },
  otro: {
    nombre: 'Turismo, shuttle u otro',
    corto: 'Turismo u otro',
    resumen: 'Hoteles, excursiones, eventos o traslados. Los pasajeros cambian de un viaje a otro.',
    pasajeros: { plural: 'Pasajeros', singular: 'pasajero' },
    promesa: 'tus buses quedan vigilados y tus pasajeros saben dónde va su bus.',
    pasos: [
      GRABAR,
      ASIGNAR,
      {
        titulo: 'Compartí el seguimiento con tus pasajeros',
        detalle: 'Un enlace por viaje o por pasajero, que vence solo cuando termina el servicio.',
        seccion: 'compartir',
      },
    ],
  },
};

/// En qué orden se ofrecen al elegir. Escolar y personal primero: son los clientes más comunes.
export const ORDEN_OPERACIONES = ['escolar', 'personal', 'linea', 'otro'];
