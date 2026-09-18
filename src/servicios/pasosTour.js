// Los pasos de la introducción de Rutas y de Transporte, en palabras de quien los usa.
//
// Un solo lugar para el texto: las pantallas no escriben su propia explicación. Los de Transporte
// salen de secciones.js (misma descripción que muestra cada sección vacía) más un consejo práctico,
// así la introducción y la pantalla nunca se contradicen.
import { OPERACIONES } from '../transporte/operaciones';
import { seccionesVisibles } from '../transporte/secciones';

const CONSEJOS_TRANSPORTE = {
  hoy: 'Cada bus es un punto sobre la tira de su recorrido: verde va bien, ámbar va atrás, rojo se desvió, gris no tiene datos. Tocá un bus para ver su viaje.',
  recorridos:
    'No hay que dibujar: elegí un viaje que el bus ya hizo y el sistema saca la línea y propone las paradas. También podés marcar los límites de velocidad por tramo.',
  horarios:
    'Si el bus ya tiene otra cosa a esa hora (otro horario o una ruta de reparto), se ve dibujado antes de guardar.',
  pasajeros:
    'Cargalos uno por uno o con la plantilla de Excel. Cada uno con su parada y el contacto que recibe los avisos.',
  conductores:
    'El conductor ve en su teléfono «Mi ruta»: su horario, sus paradas y, si lo activás, quién subió.',
  compartir:
    'Cada enlace se manda por WhatsApp o se imprime como QR. Si se reenvía, lo regenerás en un clic y el anterior deja de funcionar.',
  alertas:
    'Cada alerta trae la evidencia dibujada en el mapa. Un desvío por una calle cerrada se autoriza para toda la línea y no vuelve a sonar.',
  reportes: 'Por recorrido, por bus y por conductor. Se exporta a Excel o se imprime.',
  equipos:
    'Si un bus sale «datos insuficientes» varios días, es un equipo para revisar: el sistema prefiere decirlo antes que inventar alertas.',
  configuracion:
    'Cambiar el tipo de transporte cambia las palabras de las pantallas, no tus recorridos ni horarios.',
};

/**
 * Pasos de Transporte para una operación y lo que puede hacer la persona (un conductor no ve
 * alertas, reportes ni configuración).
 */
export function pasosTransporte({ operacion, configura, demo }) {
  const op = OPERACIONES[operacion];
  const pasos = [
    {
      etiqueta: demo ? 'Demo simulada' : 'Bienvenida',
      titulo: 'Esto es Transporte',
      texto: `Vigila que cada bus cumpla su recorrido fijo: si se desvía, si se detiene en cada parada y a qué velocidad va${op?.pasajeros ? `, y deja que ${op.pasajeros.plural.toLowerCase()} y sus contactos sigan el bus desde el teléfono` : ''}.`,
      consejo: demo
        ? 'Los buses de esta demo se mueven solos: algunas vueltas traen a propósito un desvío, una parada saltada o un exceso de velocidad, para que veas cómo lo avisa.'
        : null,
    },
    {
      etiqueta: 'Menú',
      titulo: 'Todo está en este menú',
      texto:
        'De arriba hacia abajo: lo que mirás todo el día, lo que armás una vez y lo que compartís y revisás.',
      objetivo: 'menu',
    },
  ];
  const ocultasParaConductor = new Set([
    'pasajeros',
    'compartir',
    'alertas',
    'reportes',
    'equipos',
    'configuracion',
  ]);
  for (const s of seccionesVisibles(operacion).flat()) {
    if (!configura && ocultasParaConductor.has(s.clave)) continue;
    pasos.push({
      etiqueta: 'Sección',
      titulo: s.titulo,
      texto: s.descripcion,
      consejo: CONSEJOS_TRANSPORTE[s.clave] ?? null,
      ruta: s.ruta,
      objetivo: 'contenido',
    });
  }
  pasos.push({
    etiqueta: 'Listo',
    titulo: '¿Por dónde empiezo?',
    texto: op
      ? `En «Hoy» tenés los primeros pasos para ${op.nombre.toLowerCase()}. Esta introducción la volvés a ver cuando quieras con «Ver introducción».`
      : 'Elegí qué tipo de transporte manejás y seguí los primeros pasos. Esta introducción la volvés a ver con «Ver introducción».',
    ruta: '/transporte',
  });
  return pasos;
}

/// Pasos de Rutas. `planifica` = cuenta principal o encargado; un conductor usa «Mi ruta».
export function pasosRutas({ planifica, gestionaUsuarios, demo }) {
  const pasos = [
    {
      etiqueta: demo ? 'Demo simulada' : 'Bienvenida',
      titulo: 'Esto es Rutas',
      texto:
        'Para el reparto que cambia cada día: marcás las paradas, el sistema elige el mejor orden, se lo despacha al conductor y ves en vivo qué se entregó y a qué hora.',
      consejo: demo
        ? 'El camión de esta demo sale solo con una ruta nueva cada rato: se detiene en cada punto, «entrega» y vuelve a la bodega.'
        : null,
    },
    {
      etiqueta: 'Menú',
      titulo: 'Las secciones',
      texto: 'Planificar, ver lo cargado, tu gente y los avisos.',
      objetivo: 'menu',
    },
  ];
  if (!planifica) return pasos;
  pasos.push(
    {
      etiqueta: 'Sección',
      titulo: 'Mis rutas',
      texto:
        'Tus rutas guardadas para repetir («Reparto norte, lunes y jueves») y la libreta de direcciones que se llena sola.',
      ruta: '/rutas',
      objetivo: 'contenido',
    },
    {
      etiqueta: 'Sección',
      titulo: 'Planificar',
      texto:
        'Tocá el mapa en cada parada (o elegila de la libreta). Antes de guardar ves cuántos kilómetros y minutos te ahorra el orden que propone el sistema.',
      consejo:
        'Si el vehículo ya tiene otra ruta ese día, se ve en la línea del día y podés encadenarla.',
      ruta: '/rutas/planificar',
      objetivo: 'contenido',
    },
    {
      etiqueta: 'Sección',
      titulo: 'Rutas cargadas',
      texto:
        'Lo despachado hoy y los días anteriores: dónde va cada vehículo, qué se entregó, qué no y cuánto atraso lleva. Se exporta a Excel, CSV o Google Earth.',
      ruta: '/rutas/cargadas',
      objetivo: 'contenido',
    },
  );
  if (gestionaUsuarios) {
    pasos.push({
      etiqueta: 'Sección',
      titulo: 'Usuarios',
      texto:
        'Conductores y encargados de tu cuenta, con su horario. El conductor recibe el vehículo al despacharle la ruta y lo deja de ver al cerrarla.',
      ruta: '/rutas/usuarios',
      objetivo: 'contenido',
    });
  }
  pasos.push(
    {
      etiqueta: 'Sección',
      titulo: 'Avisos',
      texto:
        'Llegadas, entregas que no se pudieron, atrasos y desvíos. Cada persona elige qué le llega por correo y qué en un resumen al final del día.',
      ruta: '/rutas/avisos',
      objetivo: 'contenido',
    },
    {
      etiqueta: 'Listo',
      titulo: 'Empezá planificando una ruta',
      texto: 'Esta introducción la volvés a ver cuando quieras con «Ver introducción».',
      ruta: '/rutas/planificar',
    },
  );
  return pasos;
}

/**
 * La introducción de la pantalla principal: qué es cada cosa la primera vez que el cliente entra.
 *
 * Es lo primero que ve alguien que nunca usó un GPS —antes caía en un mapa con puntos y nadie le
 * decía qué significaba nada—, así que explica en el orden en que se usa: dónde están sus
 * vehículos, qué dice la tarjeta de cada uno, qué hacen los botones y dónde queda el historial.
 *
 * `servicios` dice qué tiene contratado esa cuenta para no prometer lo que no va a encontrar.
 */
export function pasosMapa({ demo, conRutas, conTransporte, sensores = [] } = {}) {
  const pasos = [
    {
      etiqueta: demo ? 'Demo simulada' : 'Bienvenida',
      titulo: 'Acá ves tus vehículos en vivo',
      texto:
        'Cada vehículo manda su posición cada pocos segundos. En el mapa lo ves moverse, y de cada uno podés mirar por dónde anduvo, sus reportes y sus alertas.',
      consejo: demo
        ? 'Esta es una demo: los vehículos se mueven solos y lo que ves es simulado, para que veas cómo funciona con carros de verdad.'
        : null,
    },
    {
      etiqueta: 'Tus vehículos',
      titulo: 'La lista de la izquierda',
      texto:
        'Todos tus vehículos, con el color de su estado: en línea, sin reportar o detenido. Tocá uno y el mapa te lo muestra; el buscador de arriba sirve cuando son muchos.',
      objetivo: 'lista-vehiculos',
    },
    {
      etiqueta: 'La tarjeta',
      titulo: 'Qué dice cada dato',
      texto: [
        'Al tocar un vehículo se abre su tarjeta:',
        '· Hora — cuándo mandó la última posición.',
        '· Velocidad — a cuánto iba en ese momento.',
        '· Encendido — si el motor estaba andando.',
        '· Energía — el voltaje de la batería del carro.',
        '· Bloqueado — si tiene puesto el corte de corriente.',
        '· Distancia total — lo que lleva recorrido.',
        sensores.includes('combustible') ? '· Combustible — el nivel del tanque.' : null,
        sensores.includes('temperatura') ? '· Temperatura — la del furgón o el contenedor.' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      consejo: 'Tocá «Más detalles» para ver todo lo que manda el equipo.',
    },
    {
      etiqueta: 'Botones',
      titulo: 'Qué podés hacer con un vehículo',
      texto:
        'En la tarjeta: «…» para abrirlo en Google Maps o compartirlo, el icono de recorrido para ver por dónde anduvo, y el de enviar para mandarle un comando al equipo (por ejemplo, bloquear el motor si tenés ese servicio).',
    },
    {
      etiqueta: 'Reportes',
      titulo: 'El historial y las gráficas',
      texto:
        'En Reportes está lo que pasó: viajes, paradas, eventos, un resumen por vehículo y la gráfica, donde se ve cómo cambió la velocidad, el combustible o la temperatura a lo largo del día.',
      objetivo: 'menu-abajo',
    },
  ];
  if (conRutas || conTransporte) {
    pasos.push({
      etiqueta: 'Tus servicios',
      titulo: conRutas && conTransporte ? 'Rutas y Transporte' : conRutas ? 'Rutas' : 'Transporte',
      texto: [
        conRutas
          ? 'Rutas: armás la jornada de reparto, la mandás al conductor a su teléfono y ves si llegó a cada cliente.'
          : null,
        conTransporte
          ? 'Transporte: vigila que cada bus cumpla su recorrido fijo y deja que las familias o los pasajeros lo sigan con un enlace.'
          : null,
        'Cada uno tiene su propia introducción adentro.',
      ]
        .filter(Boolean)
        .join('\n'),
      objetivo: 'menu-abajo',
    });
  }
  return pasos;
}
