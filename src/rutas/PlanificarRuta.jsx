// Armar la jornada: elegir las paradas, ver cuánto se ahorra y despacharla.
//
// Dos formas de agregar una parada, porque el cliente no tiene catálogo de direcciones:
// tocando el mapa —que le pregunta a Traccar cómo se llama el lugar y rellena el nombre— o
// eligiéndola de la libreta, que se va llenando sola con el uso.
//
// La decisión de diseño que manda sobre el resto: **el ahorro se muestra antes de guardar**.
// Un número como «36 km en vez de 73» es el argumento entero del servicio; enseñarlo después
// de guardar llega tarde, la persona ya decidió.
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Paper,
  Typography,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  Divider,
  Chip,
  Tooltip,
  LinearProgress,
  useMediaQuery,
  Stepper,
  Step,
  StepLabel,
  Autocomplete,
  MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import FlagIcon from '@mui/icons-material/Flag';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LinkIcon from '@mui/icons-material/Link';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import MapView, { map } from '../map/core/MapView';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import MapMarkers from '../map/MapMarkers';
import maplibregl from 'maplibre-gl';
import MapScale from '../map/MapScale';
import rutasApi from './api';
import NuevoUsuarioDialog from './NuevoUsuarioDialog';
import DiaDelVehiculo from './DiaDelVehiculo';
import PuntoNuevoEnMapa from './PuntoNuevoEnMapa';

const useStyles = makeStyles()((theme) => ({
  contenedor: {
    display: 'grid',
    gridTemplateColumns: 'minmax(340px, 400px) 1fr',
    flexGrow: 1,
    minHeight: 0,
    // En pantalla angosta se apilan y el mapa va arriba: en un telefono, tocar el mapa es lo
    // primero que se hace.
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'minmax(220px, 38vh) 1fr',
    },
  },
  panel: {
    minHeight: 0,
    overflow: 'auto',
    padding: theme.spacing(2),
    borderRight: `1px solid ${theme.palette.divider}`,
    [theme.breakpoints.down('md')]: { borderRight: 'none', order: 2 },
  },
  mapa: {
    position: 'relative',
    minHeight: 0,
    [theme.breakpoints.down('md')]: { order: 1 },
  },
  // Las cifras van juntas y con el mismo peso: se leen de un vistazo, sin buscarlas.
  cifras: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' },
  cifra: {
    padding: theme.spacing(1.25, 1.75),
    borderRight: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:nth-of-type(2n)': { borderRight: 'none' },
  },
  valor: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.2,
    fontVariantNumeric: 'tabular-nums',
  },
  etiqueta: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.68rem' },
  tachado: { textDecoration: 'line-through', opacity: 0.7 },
  numero: { width: 30, height: 30, fontSize: '0.82rem', fontWeight: 600 },
  campos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.spacing(1.5),
  },
  anchoCompleto: { gridColumn: '1 / -1' },
  puntoNuevo: {
    padding: theme.spacing(2),
    borderColor: theme.palette.error.main,
  },
  tipos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.spacing(1),
  },
  tipo: {
    padding: theme.spacing(1.25),
    cursor: 'pointer',
    '&:hover': { borderColor: theme.palette.text.secondary },
  },
  tipoElegido: {
    borderColor: theme.palette.primary.main,
    borderWidth: 2,
    backgroundColor: theme.palette.action.selected,
  },
  salida: { backgroundColor: theme.palette.success.main },
  parada: { backgroundColor: theme.palette.primary.main },
}));

const hoy = () => new Date().toISOString().slice(0, 10);

// Las dos clases de trabajo que hace un vehículo, dichas con un ejemplo en vez de con la
// palabra técnica. La regla de abajo es la consecuencia práctica: es lo que la persona
// necesita saber para elegir, y lo que va a pasar si después hay que agregar una parada.
const TIPOS = [
  {
    clave: 'paquetes',
    titulo: 'Entrega de paquetes',
    ejemplo: 'Sale cargado y reparte: muebles, pedidos, encomiendas.',
    regla:
      'Termina de vuelta en el origen. Una entrega agregada después va detrás de pasar a recogerla.',
  },
  {
    clave: 'recorrido',
    titulo: 'Recorrido',
    ejemplo: 'Visita sin llevar carga: cobros, inspecciones, supervisión.',
    regla: 'Una parada nueva se mete donde convenga, sin pasar por el origen.',
  },
];

// Los tamaños de un lugar, dichos como la persona los piensa. 50 m es el de fábrica: cubre el
// error normal del GPS en ciudad sin agarrar media cuadra.
const TAMANOS = [
  { metros: 30, texto: 'Chico — una casa o un local (30 m)' },
  { metros: 50, texto: 'Normal — un negocio con parqueo en la calle (50 m)' },
  { metros: 100, texto: 'Grande — bodega o plantel (100 m)' },
  { metros: 200, texto: 'Muy grande — mall, parqueo amplio (200 m)' },
];

const ORDEN_DISPO = { libre: 0, fuera_de_horario: 1, ocupado: 2 };

/**
 * Libre, ocupado o fuera de horario, con color y con palabras: el color solo no alcanza, y en el
 * menú del selector hay que poder leerlo sin abrir nada más.
 */
const EstadoConductor = ({ estado, largo = false }) => {
  if (!estado) return null;
  if (estado.estado === 'ocupado') {
    return (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        label={`Ocupado ${hora(estado.choque.desde)} a ${hora(estado.choque.hasta)}${
          largo && estado.choque.ruta ? ` · ${estado.choque.ruta}` : ''
        }`}
      />
    );
  }
  if (estado.estado === 'fuera_de_horario') {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label={`Fuera de horario +${estado.minutosFuera} min${largo ? ` · trabaja ${estado.entra} a ${estado.sale}` : ''}`}
      />
    );
  }
  return (
    <Chip
      size="small"
      color="success"
      variant="outlined"
      label={
        largo && estado.rutas.length
          ? `Libre a esa hora · ya tiene ${estado.rutas.length} ${estado.rutas.length === 1 ? 'ruta' : 'rutas'} ese día`
          : 'Libre'
      }
    />
  );
};

// La última opción del selector de conductor: dar de alta a uno sin salir de acá. Se
// reconoce por el id, que ningún usuario de Traccar puede tener.
const NUEVO_CONDUCTOR = { id: '__nuevo__', nombre: 'Agregar conductor o encargado…' };

// Una linea por paso. Es la diferencia entre una pantalla con seis campos y una que se
// explica sola a alguien que entra por primera vez.
const AYUDA = [
  'Tocá el mapa donde tenés que entregar, o buscá el lugar con la lupa. La primera parada es el punto de salida.',
  'Ponele nombre a la ruta y elegí vehículo, conductor y hora de salida.',
  'Revisá el orden y despachá: el conductor la ve en su teléfono al instante.',
];

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

// Hora de salida + N minutos, en hora local. Sirve para decir a que hora vuelve el camion.
// Suma minutos a una hora ya formateada («08:04 a. m.»): se usa para decir a que hora se va
// de una parada, que es la llegada mas lo que se queda.
const horaMasMin = (fecha, horaTexto, minutos) => {
  const [hm, sufijo] = horaTexto.split(/\s+/);
  let [h, m] = hm.split(':').map(Number);
  if (/p/i.test(sufijo ?? '') && h !== 12) h += 12;
  if (/a/i.test(sufijo ?? '') && h === 12) h = 0;
  const d = new Date(`${fecha}T00:00:00`);
  d.setHours(h, m + minutos, 0, 0);
  return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
};

const horaMas = (fecha, horaSalida, minutos) => {
  const d = new Date(`${fecha}T${horaSalida}:00`);
  d.setMinutes(d.getMinutes() + minutos);
  return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
};

// Cuando el vehiculo queda libre: la salida mas todo lo que dura la jornada, que ya incluye
// el regreso y el tiempo dentro de cada punto.
const finDe = (j) => {
  const salida = j.paradas?.[0]?.horaEstimada;
  if (!salida || j.minutosEstimados == null) return null;
  return new Date(new Date(salida).getTime() + j.minutosEstimados * 60000);
};

// La salida como marca de tiempo, para compararla con el fin de la ruta anterior. Va acá
// arriba y no dentro del componente porque React 19 exige que el render sea puro y `new Date`
// dentro del cuerpo lo rompe, aunque el resultado dependa solo de los argumentos.
const salidaEn = (fecha, horaSalida) => new Date(`${fecha}T${horaSalida}:00`);

const hhmm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Cuánto se le pasa esta ruta del horario del conductor.
 *
 * Devuelve null cuando no hay horario definido o cuando entra dentro. Las cuentas viven acá
 * arriba, fuera del componente: React 19 exige que el render sea puro y `new Date` adentro lo
 * rompe, aunque el resultado dependa solo de los argumentos.
 */
const fueraDeHorario = (fecha, horaSalida, minutos, conductor) => {
  if (!conductor?.sale || minutos == null) return null;
  const salida = salidaEn(fecha, horaSalida);
  const fin = new Date(salida.getTime() + minutos * 60000);
  const limite = salidaEn(fecha, conductor.sale);
  const despues = Math.round((fin - limite) / 60000);
  const entrada = conductor.entra ? salidaEn(fecha, conductor.entra) : null;
  const antes = entrada ? Math.round((entrada - salida) / 60000) : 0;
  if (despues <= 0 && antes <= 0) return null;
  return { despues: Math.max(0, despues), antes: Math.max(0, antes), fin };
};

// Cuándo terminaría la ruta que se está armando: la salida más lo que dura, con regreso y
// tiempo en cada punto incluidos.
const finDeNueva = (fecha, horaSalida, minutos) =>
  minutos == null ? null : new Date(salidaEn(fecha, horaSalida).getTime() + minutos * 60000);

// «domingo 14»: como se nombra un día cuando se habla de la semana.
const diaCorto = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric' });

// El día siguiente, para cuando la ruta no cabe en la jornada de hoy.
const otroDia = (f) => {
  const d = new Date(`${f}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
};

const duracion = (min) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

// Le pregunta a Traccar cómo se llama ese lugar, con el geocodificador que el servidor ya
// tiene configurado: ni llave nueva ni proveedor nuevo.
//
// Si falla devuelve cadena vacía y la persona escribe el nombre. Es un atajo, no un
// requisito: nunca debe impedir agregar una parada.
const nombreDelLugar = async (latitud, longitud) => {
  try {
    const r = await fetch(`/api/server/geocode?latitude=${latitud}&longitude=${longitud}`);
    if (!r.ok) return '';
    const texto = (await r.text()).trim();
    // La dirección completa es larguísima para el nombre de una parada; las dos primeras
    // partes —calle y colonia, o el nombre del local— es lo que una persona reconoce.
    return texto.split(',').slice(0, 2).join(',').trim();
  } catch {
    return '';
  }
};

const PlanificarRuta = ({
  perfil,
  puntos,
  plantillas = [],
  precarga,
  onPrecargaUsada,
  onCambio,
}) => {
  const { classes, cx } = useStyles();
  const escritorio = useMediaQuery((theme) => theme.breakpoints.up('md'));

  const [nombre, setNombre] = useState('');
  const [seleccion, setSeleccion] = useState([]);
  const [vehiculo, setVehiculo] = useState(perfil.vehiculos[0]?.id ?? '');
  const [conductor, setConductor] = useState('');
  // Cómo está cada conductor ese día a esa hora: libre, con otra ruta que se pisa, o fuera de su
  // horario. Viene del servidor y no de las rutas cargadas en esta pantalla, porque un encargado
  // solo ve las suyas y no las que armó la cuenta principal para ese mismo conductor.
  const [dispo, setDispo] = useState(null);
  // Las rutas del día que se está planificando. Se piden acá y no se reciben de la lista de
  // «Rutas cargadas», que ahora viene filtrada y paginada: con otro filtro puesto, la línea del
  // día quedaría incompleta sin que nadie lo note.
  const [jornadas, setJornadas] = useState([]);
  const [fecha, setFecha] = useState(hoy);
  const [horaSalida, setHoraSalida] = useState('07:30');
  // Lo que dejó el último «Ordenar»: cuánto se ahorró contra el orden en que se marcaron.
  //
  // Antes había un interruptor «Ordenar eficiente» prendido de fábrica, y la lista se
  // reordenaba sola con cada parada agregada: uno tocaba el mapa y los puntos le saltaban de
  // lugar sin haber pedido nada. Ahora la lista respeta el orden en que se marcan, y ordenar
  // es un botón: se aprieta cuando uno quiere ver la propuesta, se ve en la lista y en el
  // mapa, y recién después se guarda.
  const [ahorro, setAhorro] = useState(null);
  const [ordenando, setOrdenando] = useState(false);
  // Qué clase de ruta es. No es una etiqueta: de acá sale si el vehículo tiene que volver al
  // origen y, sobre todo, qué puede hacer el sistema cuando haya que agregarle una parada con
  // el camión andando —una entrega nueva no se puede servir sin pasar antes a recogerla—.
  const [tipo, setTipo] = useState('paquetes');
  const [vuelveAlOrigen, setVuelveAlOrigen] = useState(true);
  // Qué quedó anidado y con qué se puede deshacer. Anidar cambia dos cosas de golpe —la hora
  // de salida y el punto de partida— y sin decirlo parecía que el formulario se movía solo.
  const [anidada, setAnidada] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [trazo, setTrazo] = useState([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [guardarPlantilla, setGuardarPlantilla] = useState(null);
  // El diálogo de guardar se abrió solo, después de despachar la jornada. Cambia lo que dice:
  // no es lo mismo pedirlo que ofrecerlo.
  const [ofrecida, setOfrecida] = useState(false);
  // Cuando se entra desde «Editar» en Mis rutas, guardar actualiza ESA ruta en vez de crear
  // otra igual. Sin esto, corregir una parada dejaba dos rutas casi idénticas en la lista.
  const [plantillaEditada, setPlantillaEditada] = useState(null);
  const [nuevoConductor, setNuevoConductor] = useState(null);
  // Con veinte o treinta puntos guardados, la lista de fichas deja de servir para encontrar
  // uno. Se busca por nombre, como en cualquier otro lado.
  const [busquedaPunto, setBusquedaPunto] = useState('');

  // Última posición del vehículo elegido, para abrir el mapa donde el cliente trabaja en vez
  // del planisferio completo.
  const posicionVehiculo = useSelector((state) => state.session.positions[Number(vehiculo)]);

  // Pone el punto nuevo en ese lugar, o lo mueve ahí si ya se estaba agregando uno: lo que se
  // escribió (minutos, tamaño, un nombre propio) no se pierde por corregir dónde cayó.
  const ubicarNuevo = async (latitud, longitud) => {
    setNuevo((actual) => ({
      nombre: '',
      sugerido: '',
      minutosEnSitio: 10,
      radioMetros: 50,
      ...actual,
      latitud,
      longitud,
      buscandoNombre: true,
    }));
    const sugerido = await nombreDelLugar(latitud, longitud);
    setNuevo((actual) => {
      if (!actual || actual.latitud !== latitud || actual.longitud !== longitud) return actual;
      // El nombre del mapa solo reemplaza al anterior si también era del mapa: lo que la persona
      // tecleó vale más que cualquier sugerencia, y la sugerencia llega con retraso.
      const propio = actual.nombre && actual.nombre !== actual.sugerido;
      return {
        ...actual,
        nombre: propio ? actual.nombre : sugerido,
        sugerido,
        buscandoNombre: false,
      };
    });
  };

  // Tocar el mapa propone un punto nuevo ahí. El listener se quita al desmontar: si quedara
  // vivo, volver a esta pantalla abriría el formulario dos veces por cada clic.
  useEffect(() => {
    const alTocar = (e) => {
      ubicarNuevo(e.lngLat.lat, e.lngLat.lng);
      // Tocado con la ciudad entera a la vista, el dedo cae a una cuadra de distancia y el
      // círculo del lugar ni se ve: se acerca una vez al nivel de calle (escala de unos 100 m)
      // para poder corregirlo. Si ya se estaba cerca, el mapa no se mueve.
      if (map.getZoom() < 15) {
        map.easeTo({ center: e.lngLat, zoom: 16, duration: 500 });
      }
    };
    map.on('click', alTocar);
    return () => map.off('click', alTocar);
  }, []);

  // En un teléfono el panel va debajo del mapa y puede estar bajado: al abrir el formulario se
  // sube, para que se vea sin buscarlo.
  const panelRef = useRef(null);
  const abierto = Boolean(nuevo);
  useEffect(() => {
    if (abierto) panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [abierto]);

  // Con dos o más paradas la ruta se mide sola, sin guardar nada. Va con medio segundo de
  // respiro para no llamar al motor en cada clic mientras se reordena la lista.
  useEffect(() => {
    if (seleccion.length < 2 || resultado) {
      setVistaPrevia(null);
      return undefined;
    }
    let vivo = true;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const datos = await rutasApi.previsualizar({
          puntoIds: seleccion,
          horaSalida,
          fecha,
          // Se mide el orden que se ve, tal cual. Proponer otro es trabajo del botón Ordenar.
          optimizar: false,
          regresoABase: tipo === 'paquetes' || vuelveAlOrigen,
        });
        if (vivo) {
          setVistaPrevia(datos);
          setTrazo((datos.coordenadas ?? []).map((c) => [c.longitud, c.latitud]));
        }
      } catch {
        if (vivo) {
          setVistaPrevia(null);
          setTrazo([]);
        }
      } finally {
        if (vivo) setCalculando(false);
      }
    }, 500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [seleccion, resultado, horaSalida, fecha, tipo, vuelveAlOrigen]);

  useEffect(() => {
    if (!precarga) return;
    setSeleccion(precarga.puntoIds);
    if (precarga.nombre) setNombre(precarga.nombre);
    setPlantillaEditada(precarga.plantillaId ?? null);
    setResultado(null);
    setTrazo([]);
    setAhorro(null);
    onPrecargaUsada?.();
  }, [precarga, onPrecargaUsada]);

  const porId = Object.fromEntries(puntos.map((p) => [p.id, p]));

  // El plan que de verdad se va a hacer: el guardado si ya existe, y si no el que
  // corresponda segun el interruptor. De aca salen el ORDEN y las horas, juntos.
  //
  // Antes la lista se dibujaba con el orden que la persona capturo pero las horas venian del
  // plan optimizado: la parada 2 «llegaba» a las 8:18 y la 3 a las 8:04. Dos fuentes para lo
  // mismo, y ninguna de las dos se entendia.
  const planEnUso = resultado
    ? {
        paradas: resultado.paradas.map((x) => ({
          puntoId: x.punto.id,
          horaEstimada: x.horaEstimada,
        })),
      }
    : vistaPrevia?.capturado;

  const ordenMostrado = planEnUso?.paradas?.length
    ? planEnUso.paradas.map((x) => x.puntoId)
    : seleccion;
  const elegidos = ordenMostrado.map((id) => porId[id]).filter(Boolean);

  const datosDe = (puntoId) => planEnUso?.paradas?.find((y) => y.puntoId === puntoId);
  const horaDe = (puntoId) => {
    const x = datosDe(puntoId);
    return x ? hora(x.horaEstimada) : null;
  };
  const viajeHasta = (puntoId) => datosDe(puntoId)?.minutosViaje ?? null;

  const limpiarCalculo = () => {
    setResultado(null);
    setTrazo([]);
    // El ahorro que se mostró era de OTRAS paradas. Dejarlo en pantalla después de agregar o
    // quitar una sería mostrar un número que ya no es cierto.
    setAhorro(null);
  };

  // Ordenar: la parada 1 queda fija —es de donde sale— y el resto se acomoda por el camino
  // más corto. El orden nuevo reemplaza al de la lista, y como la vista previa mide lo que
  // está en la lista, el mapa pasa a dibujar la ruta ordenada sin pedir nada más.
  const ordenar = async () => {
    setOrdenando(true);
    try {
      const datos = await rutasApi.previsualizar({
        puntoIds: seleccion,
        horaSalida,
        fecha,
        optimizar: true,
        regresoABase: tipo === 'paquetes' || vuelveAlOrigen,
      });
      const nuevoOrden = datos.eficiente.paradas.map((x) => x.puntoId);
      setAhorro({
        km: Math.round((datos.capturado.distanciaKm - datos.eficiente.distanciaKm) * 10) / 10,
        min: datos.capturado.minutosEstimados - datos.eficiente.minutosEstimados,
        antesKm: datos.capturado.distanciaKm,
        cambio: nuevoOrden.some((id, i) => id !== seleccion[i]),
      });
      setSeleccion(nuevoOrden);
      setResultado(null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setOrdenando(false);
    }
  };

  // Lo que ese vehiculo —o ese conductor— ya tiene ese mismo dia, en el orden en que sale.
  //
  // El caso es el normal del cliente: un camion hace el reparto de la manana, vuelve a la
  // bodega y sale otra vez. Sin esto, el encargado planificaba a ciegas y le ponia a las dos
  // rutas la misma hora de salida.
  // Las rutas del conductor elegido que armó OTRA persona: sin sumarlas, un encargado no las
  // vería en la línea del día y le cargaría otra encima.
  const rutasDelConductor =
    dispo?.conductores?.find((c) => c.id === Number(conductor))?.rutas ?? [];
  const delDia = [
    ...jornadas,
    ...rutasDelConductor.filter((r) => !jornadas.some((j) => j.id === r.id)),
  ]
    .filter(
      (j) =>
        j.fecha === fecha &&
        j.estado !== 'cancelada' &&
        j.id !== resultado?.id &&
        (j.traccarDeviceId === Number(vehiculo) ||
          (conductor && j.conductorUserId === Number(conductor))),
    )
    .sort(
      (a, b) =>
        new Date(a.paradas[0]?.horaEstimada ?? 0) - new Date(b.paradas[0]?.horaEstimada ?? 0),
    );

  const ultimaDelDia = delDia.at(-1) ?? null;
  const nombreUltima = ultimaDelDia ? ultimaDelDia.nombre || `Ruta ${delDia.length}` : '';
  const origenUltima = ultimaDelDia?.paradas[0]?.punto?.nombre ?? 'el origen';
  const finUltima = ultimaDelDia ? finDe(ultimaDelDia) : null;
  // Dos rutas que se pisan: la nueva sale antes de que el vehiculo haya vuelto.
  // El cruce se avisa cuando ya hay una ruta que armar. Con la lista de paradas vacía, la
  // alarma aparecía en la primera pantalla —antes de tocar el mapa— por una ruta que todavía
  // no existe: eso no es un aviso, es ruido, y enseña a ignorar los avisos de verdad.
  const seCruza =
    seleccion.length >= 2 && Boolean(finUltima) && salidaEn(fecha, horaSalida) < finUltima;

  // Encadenar: esta ruta empieza donde y cuando termino la anterior. Es un boton y no un
  // automatismo porque a veces el segundo viaje sale de otro lado.
  const encadenar = () => {
    if (!finUltima) return;
    const origen = ultimaDelDia.paradas[0]?.punto;
    setAnidada({
      // Con qué se puede volver atrás: lo que había antes de tocar el botón.
      antes: { horaSalida, seleccion },
      tras: nombreUltima,
      hora: hhmm(finUltima),
      origen: origen?.nombre ?? null,
    });
    setHoraSalida(hhmm(finUltima));
    if (origen?.id) {
      setSeleccion((s) =>
        s[0] === origen.id ? s : [origen.id, ...s.filter((x) => x !== origen.id)],
      );
    }
    limpiarCalculo();
  };

  const desanidar = () => {
    if (!anidada) return;
    setHoraSalida(anidada.antes.horaSalida);
    setSeleccion(anidada.antes.seleccion);
    setAnidada(null);
    limpiarCalculo();
  };

  const mover = (i, salto) => {
    const destino = i + salto;
    if (destino < 0 || destino >= seleccion.length) return;
    const copia = [...seleccion];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    setSeleccion(copia);
    limpiarCalculo();
  };

  const guardarNuevo = async () => {
    setOcupado(true);
    try {
      const punto = await rutasApi.crearPunto({
        nombre: nuevo.nombre.trim(),
        latitud: nuevo.latitud,
        longitud: nuevo.longitud,
        minutosEnSitio: Number(nuevo.minutosEnSitio),
        radioMetros: Number(nuevo.radioMetros),
      });
      setSeleccion((s) => [...s, punto.id]);
      setNuevo(null);
      limpiarCalculo();
      await onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const crear = async () => {
    setOcupado(true);
    try {
      const jornada = await rutasApi.crearJornada({
        nombre: nombre.trim() || null,
        tipo,
        regresoABase: tipo === 'paquetes' || vuelveAlOrigen,
        traccarDeviceId: Number(vehiculo),
        conductorUserId: conductor ? Number(conductor) : null,
        fecha,
        horaSalida,
        puntoIds: seleccion,
        // Lo que se guarda es exactamente lo que está en pantalla: si se ordenó, ya viene
        // ordenado; si no, se respeta el orden en que se marcó.
        optimizar: false,
      });
      // El orden que devolvió el motor reemplaza al capturado: lo que se ve en pantalla es la
      // ruta que de verdad se va a hacer, no la que se marcó.
      setSeleccion(jornada.paradas.map((p) => p.punto.id));
      setResultado(jornada);
      setError('');
      try {
        const t = await rutasApi.trazo(jornada.id);
        setTrazo(t.coordenadas.map((c) => [c.longitud, c.latitud]));
      } catch {
        setTrazo([]);
      }
      // Si las paradas no coinciden con ninguna ruta ya guardada, se ofrece guardarla. Esa es
      // la diferencia entre volver a marcar ocho puntos en el mapa mañana y cargarla en un
      // toque — y nadie va a buscar el botón por su cuenta la primera vez.
      const yaGuardada = plantillas.some(
        (pl) =>
          pl.puntos.length === jornada.paradas.length &&
          pl.puntos.every((x) => jornada.paradas.some((p) => p.punto.id === x.id)),
      );
      if (!yaGuardada && !plantillaEditada) {
        setOfrecida(true);
        setGuardarPlantilla(nombre.trim() || '');
      }
      await onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const despachar = async () => {
    setOcupado(true);
    try {
      await rutasApi.despachar(resultado.id);
      setSeleccion([]);
      setNombre('');
      limpiarCalculo();
      await onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  // Numerados y en color: la diferencia entre «unos puntos en un mapa» y una ruta que se lee
  // de un vistazo. La salida va en otro color porque es la bodega, no una entrega.
  const marcadores = elegidos.map((p, i) => ({
    latitude: p.latitud,
    longitude: p.longitud,
    image: i === 0 ? 'default-success' : 'default-info',
    title: String(i + 1),
  }));

  // La cámara se mueve solo cuando hace falta: si alguna parada quedó fuera de la vista (se cargó
  // una ruta guardada, se ordenó, se eligió de la libreta). Agregar una tocando el mapa no la
  // mueve, porque ya está a la vista.
  //
  // Antes se ajustaba en cada render a las paradas y al punto recién tocado: con uno solo, el
  // ajuste llevaba el zoom al máximo —la escala marcaba 1 m— y cualquier letra que se tecleara
  // devolvía el mapa ahí aunque la persona lo hubiera movido.
  const firmaParadas = elegidos.map((p) => `${p.latitud},${p.longitud}`).join(';');
  useEffect(() => {
    if (!elegidos.length) return;
    const coordenadas = elegidos.map((p) => [p.longitud, p.latitud]);
    const vista = map.getBounds();
    if (coordenadas.every((c) => vista.contains(c))) return;
    const caja = coordenadas.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coordenadas[0], coordenadas[0]),
    );
    const lienzo = map.getCanvas();
    map.fitBounds(caja, {
      padding: Math.min(lienzo.clientWidth, lienzo.clientHeight) * 0.15,
      maxZoom: 16,
      duration: 400,
    });
  }, [firmaParadas]);

  // Sin paradas, el mapa abre donde está el vehículo elegido. Una vez por vehículo: el vehículo
  // se mueve cada pocos segundos, y seguirlo le quitaría el mapa de las manos a quien planifica.
  const hayPosicion = Boolean(posicionVehiculo);
  useEffect(() => {
    if (!posicionVehiculo || elegidos.length) return;
    map.jumpTo({
      center: [posicionVehiculo.longitude, posicionVehiculo.latitude],
      zoom: Math.max(map.getZoom(), 12),
    });
  }, [vehiculo, hayPosicion]);

  const km = resultado?.distanciaKm ?? vistaPrevia?.capturado?.distanciaKm;
  const minutos = resultado?.minutosEstimados ?? vistaPrevia?.capturado?.minutosEstimados;

  // Se pregunta al cambiar el día, la hora o lo que dura la ruta. Con medio segundo de respiro:
  // mover la hora con las flechas no puede disparar una consulta por minuto tocado.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const datos = await rutasApi.disponibilidad({
          fecha,
          salida: horaSalida,
          ...(minutos ? { minutos } : {}),
          ...(resultado?.id ? { excluir: resultado.id } : {}),
        });
        if (vivo) setDispo(datos);
      } catch {
        if (vivo) setDispo(null);
      }
    }, 500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [fecha, horaSalida, minutos, resultado?.id]);

  const estadoDe = (id) => dispo?.conductores?.find((c) => c.id === id) ?? null;

  // Las rutas del día elegido: al cambiar la fecha y después de guardar una.
  useEffect(() => {
    let vivo = true;
    rutasApi
      .jornadas({ fecha, porPagina: 100 })
      .then((r) => vivo && setJornadas(r.items))
      .catch(() => vivo && setJornadas([]));
    return () => {
      vivo = false;
    };
  }, [fecha, resultado?.id]);
  // Cuando regresa: sin la vuelta a la vista, la lista termina en la última entrega y nadie
  // sabe a qué hora se libera el camión.
  const regreso = minutos != null ? horaMas(fecha, horaSalida, minutos) : null;
  const hayAhorro = Boolean(ahorro) && ahorro.km > 0 && !resultado;

  // El horario del conductor elegido, para avisar antes de despachar —no después— cuando la
  // ruta se le pasa de la hora. Es también lo que deja ver el tiempo trabajado de más.
  const conductorElegido = perfil.conductores.find((c) => c.id === conductor) ?? null;
  const fuera = fueraDeHorario(fecha, horaSalida, minutos, conductorElegido);
  const paso = resultado ? 2 : seleccion.length >= 2 ? 1 : 0;

  return (
    <div className={classes.contenedor}>
      <div className={classes.panel} ref={panelRef}>
        <Stack spacing={2}>
          {/* Va en el panel y no en un diálogo: un diálogo tapa el mapa, y es justo el mapa lo que
              hay que mirar —y tocar— para corregir dónde cayó el punto. */}
          {nuevo && (
            <Paper variant="outlined" className={classes.puntoNuevo}>
              <Stack spacing={2}>
                <div>
                  <Typography variant="subtitle1">Parada nueva</Typography>
                  <Typography variant="body2" color="text.secondary">
                    ¿Cayó mal? Arrastrá el punto rojo o tocá otro lugar del mapa. El círculo es
                    donde se va a buscar la llegada.
                  </Typography>
                </div>
                <TextField
                  label="Nombre"
                  size="small"
                  fullWidth
                  // En un teléfono, abrir el teclado taparía el mapa justo cuando hay que mirar
                  // si el punto cayó bien.
                  autoFocus={escritorio}
                  placeholder={nuevo.buscandoNombre ? 'Buscando el nombre del lugar...' : ''}
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  helperText="Lo sugiere el mapa; cambialo por el nombre con el que vos lo conocés."
                />
                <TextField
                  label="Minutos en el punto"
                  size="small"
                  type="number"
                  fullWidth
                  value={nuevo.minutosEnSitio}
                  onChange={(e) => setNuevo({ ...nuevo, minutosEnSitio: e.target.value })}
                  helperText="Cuánto se tarda descargando. Sin esto las horas de las paradas siguientes salen cortas."
                />
                {/* Cuánto espacio es «el lugar». No decide la llegada —eso lo confirman el motor
                    o el estacionamiento— solo dónde se busca. Con ejemplos, porque «radio» a
                    secas no le dice nada a quien arma la ruta. */}
                <TextField
                  select
                  label="Tamaño del lugar"
                  size="small"
                  fullWidth
                  value={nuevo.radioMetros}
                  onChange={(e) => setNuevo({ ...nuevo, radioMetros: e.target.value })}
                  helperText="Pasar cerca o quedar en una cola no cuenta: tiene que estacionarse o apagar el motor."
                >
                  {TAMANOS.map((t) => (
                    <MenuItem key={t.metros} value={t.metros}>
                      {t.texto}
                    </MenuItem>
                  ))}
                </TextField>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button onClick={() => setNuevo(null)}>Cancelar</Button>
                  <Button
                    variant="contained"
                    onClick={guardarNuevo}
                    disabled={ocupado || !nuevo.nombre?.trim()}
                  >
                    Agregar parada
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          {/* Tres pasos, y el que va en curso resaltado. La pantalla tiene un mapa, una lista
              y seis campos: sin decir en qué orden se usan, el cliente no adivina. */}
          <Stepper activeStep={paso} sx={{ px: 0 }}>
            <Step>
              <StepLabel slotProps={{ label: { sx: { fontSize: '0.76rem' } } }}>Paradas</StepLabel>
            </Step>
            <Step>
              <StepLabel slotProps={{ label: { sx: { fontSize: '0.76rem' } } }}>Datos</StepLabel>
            </Step>
            <Step>
              <StepLabel slotProps={{ label: { sx: { fontSize: '0.76rem' } } }}>
                Despachar
              </StepLabel>
            </Step>
          </Stepper>

          <Typography variant="body2" color="text.secondary">
            {AYUDA[paso]}
          </Typography>

          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Lo primero que hay que saber de una ruta, porque cambia todo lo demás.
              Van como dos tarjetas y no como un interruptor con dos palabras: «paquetes» y
              «recorrido» no le dicen nada a quien entra por primera vez — el ejemplo sí. */}
          <Typography variant="subtitle2">¿Qué va a hacer el vehículo?</Typography>
          <div className={classes.tipos}>
            {TIPOS.map((t) => (
              <Paper
                key={t.clave}
                variant="outlined"
                className={cx(classes.tipo, tipo === t.clave && classes.tipoElegido)}
                onClick={() => {
                  setTipo(t.clave);
                  limpiarCalculo();
                }}
              >
                <Typography variant="subtitle2">{t.titulo}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {t.ejemplo}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {t.regla}
                </Typography>
              </Paper>
            ))}
          </div>
          {tipo === 'recorrido' && (
            <FormControlLabel
              control={
                <Switch
                  checked={vuelveAlOrigen}
                  onChange={(e) => {
                    setVuelveAlOrigen(e.target.checked);
                    limpiarCalculo();
                  }}
                />
              }
              label="Vuelve al origen al terminar"
            />
          )}

          <div className={classes.campos}>
            <TextField
              size="small"
              className={classes.anchoCompleto}
              label="Nombre de la ruta"
              placeholder="Reparto Norte"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              helperText="Para reconocerla mañana y volver a usarla"
            />
            <Autocomplete
              size="small"
              options={perfil.vehiculos}
              getOptionLabel={(o) => o.nombre ?? ''}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={perfil.vehiculos.find((v) => v.id === vehiculo) ?? null}
              onChange={(_e, v) => setVehiculo(v?.id ?? '')}
              renderInput={(params) => <TextField {...params} label="Vehículo" />}
            />
            {/* Crear un conductor vive DENTRO del selector, como última opción de la lista.
                Antes era un botón de ancho completo entre los campos: una barra grande que
                competía con el vehículo y la fecha para algo que se hace una vez al mes. */}
            <Autocomplete
              size="small"
              // Solo conductores: la lista de la cuenta trae también a los encargados, que no
              // manejan, y el servidor rechaza asignarle una ruta a uno.
              // Los libres primero: es a quien se está buscando.
              options={[
                ...perfil.conductores
                  .filter((c) => c.rol === 'conductor')
                  .sort(
                    (x, y) =>
                      (ORDEN_DISPO[estadoDe(x.id)?.estado] ?? 1) -
                      (ORDEN_DISPO[estadoDe(y.id)?.estado] ?? 1),
                  ),
                NUEVO_CONDUCTOR,
              ]}
              getOptionLabel={(o) => o.nombre ?? ''}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={perfil.conductores.find((c) => c.id === conductor) ?? null}
              onChange={(_e, v) => {
                if (v?.id === NUEVO_CONDUCTOR.id) {
                  setNuevoConductor(true);
                  return;
                }
                setConductor(v?.id ?? '');
              }}
              renderOption={(props, o) => {
                const { key, ...resto } = props;
                return o.id === NUEVO_CONDUCTOR.id ? (
                  <li key={key} {...resto} style={{ gap: 8 }}>
                    <PersonAddIcon fontSize="small" color="primary" />
                    <Typography variant="body2" color="primary">
                      {o.nombre}
                    </Typography>
                  </li>
                ) : (
                  <li key={key} {...resto} style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span>{o.nombre}</span>
                    <EstadoConductor estado={estadoDe(o.id)} />
                  </li>
                );
              }}
              renderInput={(params) => <TextField {...params} label="Conductor" />}
            />
            {/* Cómo está el elegido, dicho debajo: el chip del menú desaparece al cerrarlo. */}
            {conductor && estadoDe(Number(conductor)) && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                className={classes.anchoCompleto}
                sx={{ mt: -0.5, flexWrap: 'wrap', gap: 0.5 }}
              >
                <EstadoConductor estado={estadoDe(Number(conductor))} largo />
                <Button
                  size="small"
                  component="a"
                  href={`/rutas/usuarios/${conductor}`}
                  target="_blank"
                  rel="noopener"
                >
                  Ver su semana
                </Button>
              </Stack>
            )}
            <TextField
              size="small"
              type="date"
              label="Fecha"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              type="time"
              label="Salida"
              value={horaSalida}
              onChange={(e) => setHoraSalida(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </div>

          {/* El día del vehículo. Un choque de horarios se entiende VIÉNDOLO, no leyéndolo:
              dos bloques encimados se leen en un segundo, como cualquier calendario. Y cada
              salida dice su resultado antes de elegirla, en vez de un botón con una palabra
              técnica que hay que adivinar. */}
          {delDia.length > 0 && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <DiaDelVehiculo
                titulo={`Lo que ya tiene el ${diaCorto(fecha)}`}
                rutas={delDia.map((j, i) => ({
                  id: j.id,
                  nombre: j.nombre || `Ruta ${i + 1}`,
                  salida: j.paradas[0]?.horaEstimada,
                  fin: finDe(j),
                }))}
                nueva={
                  seleccion.length >= 2
                    ? {
                        salida: salidaEn(fecha, horaSalida),
                        fin: finDeNueva(fecha, horaSalida, minutos),
                      }
                    : null
                }
                horario={conductorElegido}
              />

              {anidada ? (
                <Alert
                  severity="success"
                  icon={<LinkIcon fontSize="inherit" />}
                  sx={{ mt: 1.5 }}
                  action={
                    <Button size="small" onClick={desanidar}>
                      Deshacer
                    </Button>
                  }
                >
                  Va después de «{anidada.tras}»: sale {anidada.hora}
                  {anidada.origen ? ` desde ${anidada.origen}` : ''}, cuando el vehículo vuelve.
                </Alert>
              ) : seCruza ? (
                <>
                  <Typography variant="body2" sx={{ mt: 1.5, mb: 1 }}>
                    Se pisa con «{nombreUltima}». ¿Qué hacemos?
                  </Typography>
                  <div className={classes.tipos}>
                    <Paper variant="outlined" className={classes.tipo} onClick={encadenar}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <LinkIcon fontSize="small" color="primary" />
                        <Typography variant="subtitle2">Después de «{nombreUltima}»</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Sale {hhmm(finUltima)} desde {origenUltima}, cuando el vehículo vuelve.
                      </Typography>
                    </Paper>
                    <Paper
                      variant="outlined"
                      className={classes.tipo}
                      onClick={() => {
                        setFecha(otroDia(fecha));
                        limpiarCalculo();
                      }}
                    >
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <EventIcon fontSize="small" color="primary" />
                        <Typography variant="subtitle2">Otro día</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        El {diaCorto(otroDia(fecha))} a las {horaSalida}.
                      </Typography>
                    </Paper>
                  </div>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    O cambiá la hora de salida arriba.
                  </Typography>
                </>
              ) : (
                seleccion.length >= 2 &&
                finUltima && (
                  <Button size="small" startIcon={<LinkIcon />} sx={{ mt: 1 }} onClick={encadenar}>
                    Hacerla justo después de «{nombreUltima}» ({hhmm(finUltima)})
                  </Button>
                )
              )}
            </Paper>
          )}

          {/* Las cifras de la jornada. Aparecen con la segunda parada: responden «¿cuánto me
              cuesta este día?» antes de comprometerse con nada. */}
          {(vistaPrevia || resultado) && (
            <Paper variant="outlined">
              {calculando && <LinearProgress />}
              <div className={classes.cifras}>
                <div className={classes.cifra}>
                  <Typography className={classes.etiqueta} color="text.secondary">
                    Distancia
                  </Typography>
                  <Typography className={classes.valor}>{km} km</Typography>
                  {hayAhorro && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      className={classes.tachado}
                    >
                      {ahorro.antesKm} km en tu orden
                    </Typography>
                  )}
                </div>
                <div className={classes.cifra}>
                  <Typography className={classes.etiqueta} color="text.secondary">
                    En ruta
                  </Typography>
                  <Typography className={classes.valor}>{duracion(minutos)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    incluye el tiempo en cada punto
                  </Typography>
                </div>
                <div className={classes.cifra}>
                  <Typography className={classes.etiqueta} color="text.secondary">
                    Regreso
                  </Typography>
                  <Typography className={classes.valor}>{regreso ?? '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    el vehículo queda libre
                  </Typography>
                </div>
                {hayAhorro && (
                  <div className={classes.cifra}>
                    <Typography className={classes.etiqueta} color="success.main">
                      Ahorro
                    </Typography>
                    <Typography className={cx(classes.valor)} color="success.main">
                      −{ahorro.km} km
                    </Typography>
                    <Typography variant="caption" color="success.main">
                      {ahorro.min > 0 ? `${ahorro.min} min menos` : 'mismo tiempo'}
                    </Typography>
                  </div>
                )}
              </div>
            </Paper>
          )}

          <Paper variant="outlined">
            <List dense disablePadding>
              {elegidos.map((p, i) => (
                <ListItem
                  key={p.id}
                  divider={i < elegidos.length - 1}
                  secondaryAction={
                    <>
                      {!resultado && (
                        <Tooltip title="Subir">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => mover(i, -1)}
                              disabled={i === 0}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {!resultado && (
                        <Tooltip title="Bajar">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => mover(i, 1)}
                              disabled={i === elegidos.length - 1}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Quitar de la ruta">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSeleccion((s) => s.filter((x) => x !== p.id));
                            limpiarCalculo();
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  }
                >
                  <ListItemAvatar sx={{ minWidth: 46 }}>
                    <Avatar
                      className={cx(classes.numero, i === 0 ? classes.salida : classes.parada)}
                    >
                      {i + 1}
                    </Avatar>
                  </ListItemAvatar>
                  {/* Margen para las tres acciones de la derecha (subir, bajar, quitar). La
                      lista reserva lugar para UNA; con tres, el texto quedaba debajo de las
                      flechas y «llega 08:04» se leía «llega 08:0↑». */}
                  <ListItemText
                    sx={{ mr: resultado ? 0 : 8 }}
                    primary={
                      i === 0 ? (
                        <>
                          {p.nombre}
                          <Chip
                            size="small"
                            label="Salida"
                            color="success"
                            variant="outlined"
                            sx={{ ml: 1, height: 18, fontSize: '0.62rem' }}
                          />
                        </>
                      ) : (
                        p.nombre
                      )
                    }
                    secondary={
                      i === 0
                        ? `Sale ${horaDe(p.id) ?? horaSalida}${
                            viajeHasta(elegidos[1]?.id)
                              ? ` · ${viajeHasta(elegidos[1].id)} min hasta la primera parada`
                              : ''
                          }`
                        : horaDe(p.id)
                          ? `${viajeHasta(p.id)} min de viaje · llega ${horaDe(p.id)} · se va ${horaMasMin(fecha, horaDe(p.id), p.minutosEnSitio)}`
                          : `${p.minutosEnSitio} min en el punto`
                    }
                  />
                </ListItem>
              ))}
              {regreso && elegidos.length >= 2 && (
                <ListItem>
                  <ListItemAvatar sx={{ minWidth: 46 }}>
                    <Avatar className={cx(classes.numero, classes.salida)}>
                      <FlagIcon fontSize="small" />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`Regresa a ${elegidos[0].nombre}`}
                    secondary={`Llega ${regreso} · el vehículo queda libre`}
                  />
                </ListItem>
              )}
              {elegidos.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="Todavía no agregaste paradas"
                    secondary="Tocá el mapa donde tenés que entregar, o buscá el lugar con la lupa. Cada punto queda guardado para las próximas rutas."
                  />
                </ListItem>
              )}
            </List>
          </Paper>

          {/* El horario del conductor. Se avisa antes de guardar: después ya está
              comprometido y la conversación es otra. */}
          {fuera && conductorElegido && (
            <Alert
              severity="warning"
              action={
                <Button
                  size="small"
                  onClick={() => {
                    setFecha(otroDia(fecha));
                    limpiarCalculo();
                  }}
                >
                  Otro día
                </Button>
              }
            >
              {fuera.despues > 0
                ? `${conductorElegido.nombre} sale a las ${conductorElegido.sale} y esta ruta termina ${hhmm(fuera.fin)}: ${duracion(fuera.despues)} fuera de su horario.`
                : `${conductorElegido.nombre} entra a las ${conductorElegido.entra} y esta ruta sale ${horaSalida}: ${duracion(fuera.antes)} antes de su horario.`}
            </Alert>
          )}

          {resultado && (
            <Alert
              severity="success"
              action={
                <Button onClick={despachar} disabled={ocupado} variant="contained" size="small">
                  Despachar
                </Button>
              }
            >
              Ruta guardada. Al despachar queda vigilada y el conductor la ve en su teléfono.
            </Alert>
          )}

          {/* Qué pasó al ordenar. Si el orden ya era el mejor, también se dice: si no, parece
              que el botón no hizo nada. */}
          {ahorro && !resultado && (
            <Typography variant="caption" color={hayAhorro ? 'success.main' : 'text.secondary'}>
              {hayAhorro
                ? `Ordenada: ${ahorro.km} km menos que en el orden en que las marcaste. La salida quedó primera.`
                : 'Tu orden ya era el más corto. No hubo que mover nada.'}
            </Typography>
          )}

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {/* Con dos paradas no hay nada que ordenar: la primera es la salida y no se mueve. */}
            <Tooltip title="La parada 1 es la salida y no se mueve. Las demás se acomodan por el camino más corto.">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<TrendingDownIcon />}
                  disabled={ordenando || ocupado || seleccion.length < 3 || Boolean(resultado)}
                  onClick={ordenar}
                >
                  {ordenando ? 'Ordenando…' : 'Ordenar ruta'}
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              disabled={ocupado || seleccion.length < 2 || !vehiculo || Boolean(resultado)}
              onClick={crear}
            >
              Guardar ruta
            </Button>
            {seleccion.length > 0 && (
              <Button
                onClick={() => {
                  setSeleccion([]);
                  limpiarCalculo();
                }}
                disabled={ocupado}
              >
                Limpiar
              </Button>
            )}
          </Stack>

          <Divider />
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle2">Rutas guardadas</Typography>
            <Typography variant="caption" color="text.secondary">
              {plantillas.length > 0 ? 'tocá una para cargarla' : 'guardá una ruta para repetirla'}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {plantillas.map((pl) => (
              <Chip
                key={pl.id}
                label={`${pl.nombre} · ${pl.puntos.length}`}
                variant="outlined"
                color="primary"
                onClick={() => {
                  setSeleccion(pl.puntos.map((x) => x.id));
                  setNombre(pl.nombre);
                  limpiarCalculo();
                }}
              />
            ))}
            {seleccion.length >= 2 && (
              <Chip
                icon={<BookmarkAddIcon />}
                color={plantillaEditada ? 'primary' : 'default'}
                label={plantillaEditada ? 'Guardar cambios' : 'Guardar esta ruta'}
                onClick={() => setGuardarPlantilla(nombre || '')}
              />
            )}
          </Stack>

          <Divider />
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle2">Libreta de puntos</Typography>
            <Typography variant="caption" color="text.secondary">
              {puntos.length > 0 ? `${puntos.length} guardados` : 'se llena sola con el uso'}
            </Typography>
          </Stack>
          {puntos.length > 8 && (
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar un punto guardado"
              value={busquedaPunto}
              onChange={(e) => setBusquedaPunto(e.target.value)}
              slotProps={{
                input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> },
              }}
            />
          )}
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {puntos
              .filter(
                (p) =>
                  !seleccion.includes(p.id) &&
                  p.nombre.toLowerCase().includes(busquedaPunto.trim().toLowerCase()),
              )
              .map((p) => (
                <Chip
                  key={p.id}
                  label={p.nombre}
                  icon={<AddIcon />}
                  variant="outlined"
                  onClick={() => {
                    setSeleccion((s) => [...s, p.id]);
                    limpiarCalculo();
                  }}
                />
              ))}
          </Stack>
        </Stack>
      </div>

      <div className={classes.mapa}>
        <MapView>
          <MapRouteCoordinates name="Ruta" coordinates={trazo} />
          <MapMarkers markers={marcadores} showTitles />
          {nuevo && (
            <PuntoNuevoEnMapa
              latitud={nuevo.latitud}
              longitud={nuevo.longitud}
              radioMetros={nuevo.radioMetros}
              onMover={ubicarNuevo}
            />
          )}
        </MapView>
        <MapGeocoder />
        <MapScale />
      </div>

      <Dialog
        open={guardarPlantilla !== null}
        onClose={() => {
          setGuardarPlantilla(null);
          setOfrecida(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {ofrecida
            ? '¿Guardo esta ruta para repetirla?'
            : plantillaEditada
              ? 'Guardar cambios'
              : 'Guardar esta ruta'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Nombre"
            size="small"
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            value={guardarPlantilla ?? ''}
            onChange={(e) => setGuardarPlantilla(e.target.value)}
            helperText={
              ofrecida
                ? 'La jornada ya quedó guardada. Esto guarda además las paradas y su orden, para cargarla otro día sin volver a marcarlas.'
                : 'Queda guardada con sus paradas y su orden. Después se le asigna el vehículo, el conductor y la fecha que toque.'
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setGuardarPlantilla(null);
              setOfrecida(false);
            }}
          >
            {ofrecida ? 'Ahora no' : 'Cancelar'}
          </Button>
          <Button
            disabled={ocupado || !guardarPlantilla?.trim()}
            onClick={async () => {
              setOcupado(true);
              try {
                const datos = { nombre: guardarPlantilla.trim(), puntoIds: seleccion };
                if (plantillaEditada) {
                  await rutasApi.editarPlantilla(plantillaEditada, datos);
                } else {
                  await rutasApi.crearPlantilla(datos);
                }
                setGuardarPlantilla(null);
                setOfrecida(false);
                await onCambio();
              } catch (e) {
                setError(e.message);
              } finally {
                setOcupado(false);
              }
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <NuevoUsuarioDialog
        open={Boolean(nuevoConductor)}
        onClose={() => setNuevoConductor(null)}
        onCreado={async (creado, rol) => {
          await onCambio();
          // Un conductor recién creado queda elegido: quien lo crea es porque lo va a usar
          // ahora. Un encargado no conduce, así que no se asigna a la ruta.
          if (rol === 'conductor') setConductor(creado.id);
        }}
      />
    </div>
  );
};

export default PlanificarRuta;
