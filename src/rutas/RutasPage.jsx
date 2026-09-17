// Pantalla del administrador: planificar la jornada y ver cómo va.
//
// Dos secciones, como se decidió con el cliente: "Planificar rutas" arma el día y "Rutas
// cargadas" muestra el cumplimiento. El conductor no entra acá — tiene su propia pantalla.
//
// La navegación va en la columna izquierda con `PageLayout`, igual que los ajustes de
// Traccar, y cada sección tiene su propia dirección (`/rutas/planificar`, …). Así el botón
// de atrás del navegador y un enlace copiado hacen lo que uno espera, cosa que con pestañas
// guardadas en memoria no pasaba.
import { useState, useCallback, useMemo, useEffect, Fragment } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Typography,
  Alert,
  LinearProgress,
  Tooltip,
  Stack,
  Pagination,
  MenuItem,
  TextField,
  InputAdornment,
  Paper,
  useMediaQuery,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import PageLayout from '../common/components/PageLayout';
import RutasMenu from './RutasMenu';
import { useEffectAsync } from '../reactHelper';
import { useAdministrator } from '../common/util/permissions';
import SelectorCliente from '../servicios/SelectorCliente';
import { useClienteAdmin, guardarClienteAdmin } from '../servicios/clienteAdmin';
import rutasApi from './api';
import JornadaMapa from './JornadaMapa';
import NuevoUsuarioDialog from './NuevoUsuarioDialog';
import PlanificarRuta from './PlanificarRuta';
import AgregarParadasDialog from './AgregarParadasDialog';
import Avisos from './Avisos';
import FiltrosRutas from './FiltrosRutas';
import ConductorFicha from './ConductorFicha';
import TourGuiado, { useTour } from '../servicios/TourGuiado';
import BarraIntroduccion from '../servicios/BarraIntroduccion';
import { pasosRutas } from '../servicios/pasosTour';

const useStyles = makeStyles()((theme) => ({
  // `minHeight: 0` no es decorativo: un elemento flex nunca se encoge por debajo de su
  // contenido salvo que se le diga, y sin eso el mapa empuja la tabla fuera de la pantalla
  // en vez de que la tabla scrollee. Es el mismo patrón de las páginas de reportes.
  cuerpo: { flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  // En el teléfono cada fila es una tarjeta: una tabla de ocho columnas en 390 px dejaba fuera
  // la situación y todos los botones, y no había cómo llegar a ellos.
  tarjetas: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
  },
  tarjeta: { padding: theme.spacing(1.5) },
  botones: {
    display: 'flex',
    flexWrap: 'wrap',
    marginTop: theme.spacing(1),
    marginLeft: theme.spacing(-0.75),
  },
}));

// Dar la ruta optima sin decir cuanto dura es media respuesta.
const duracion = (min) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fecha = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

// Cuando el vehículo queda libre: la salida más todo lo que dura la jornada, que ya incluye
// el regreso a la base y el tiempo dentro de cada punto. Antes acá se mostraba la hora de la
// última parada y se le llamaba «regreso»: eran dos cosas distintas con el mismo nombre.
const finDe = (j) => {
  const salida = j.paradas?.[0]?.horaEstimada;
  if (!salida || j.minutosEstimados == null) return null;
  return new Date(new Date(salida).getTime() + j.minutosEstimados * 60000).toISOString();
};

// El color dice el estado antes que el texto: en una lista de veinte jornadas, lo que se
// busca es la que va mal.
const COLOR_SITUACION = {
  sin_despachar: 'default',
  sin_iniciar: 'default',
  en_camino: 'primary',
  en_sitio: 'info',
  regresando: 'secondary',
  finalizada: 'success',
  cancelada: 'default',
};

const POR_PAGINA = 50;

const SIN_PLANTILLAS =
  'Todavía no guardaste ninguna ruta. Armá una en «Planificar» y guardala con un nombre: después la asignás a cualquier vehículo y conductor sin volver a marcar las paradas.';
const SIN_USUARIOS =
  'Todavía no creaste usuarios. Agregá el primero con el botón «Agregar usuario».';

/// Solo estos van al servidor: la dirección puede traer otros parámetros de la aplicación, y el
/// servicio rechaza lo que no conoce.
const FILTROS_PERMITIDOS = [
  'q',
  'desde',
  'hasta',
  'estado',
  'traccarDeviceId',
  'conductorUserId',
  'creadorId',
  'tipo',
  'novedades',
  'orden',
  'pagina',
];

const ORDEN_PLANTILLAS = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre),
  usos: (a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre),
  reciente: (a, b) =>
    (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? '') || a.nombre.localeCompare(b.nombre),
};

const SECCIONES = [
  '/rutas',
  '/rutas/planificar',
  '/rutas/cargadas',
  '/rutas/usuarios',
  '/rutas/avisos',
];

const RutasPage = () => {
  const { classes } = useStyles();
  const angosta = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const admin = useAdministrator();
  // Un administrador trabaja para un cliente o mira todos (ver servicios/clienteAdmin.js). Mirando
  // todos, puede ver las rutas pero no crear: lo que armara no sería de ningún cliente.
  const clienteElegido = useClienteAdmin();
  const clienteId = admin ? (clienteElegido?.id ?? null) : null;
  const viendoTodos = admin && !clienteId;
  const { id, conductorId } = useParams();
  const { pathname } = useLocation();

  // La sección sale de la dirección, no de un estado propio: el menú de la izquierda también
  // necesita saber cuál está abierta, y la misma verdad guardada en dos lugares es como se
  // desincronizan. De paso, el botón de atrás y un enlace copiado funcionan.
  const seccion = Math.max(
    0,
    SECCIONES.findIndex((s, i) => (i === 0 ? pathname === s : pathname.startsWith(s))),
  );
  const irA = (i) => navigate(SECCIONES[i]);

  const [perfil, setPerfil] = useState(null);
  const [jornadas, setJornadas] = useState([]);
  const [puntos, setPuntos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  // Paradas que se cargan en el planificador al entrar: vienen de una plantilla o de repetir
  // una jornada anterior. Es lo que evita volver a marcar ocho puntos en el mapa.
  const [precarga, setPrecarga] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState(false);
  const [usuarioEditado, setUsuarioEditado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  // «Rutas cargadas» se busca, filtra, ordena y pagina en el servidor. Los filtros viven en la
  // dirección de la página: el botón de atrás vuelve a la misma búsqueda y un enlace copiado
  // muestra lo mismo.
  const [params, setParams] = useSearchParams();
  const [totalRutas, setTotalRutas] = useState(0);
  const [truncado, setTruncado] = useState(false);
  const [creadores, setCreadores] = useState([]);
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '');
  // Cómo se ordenan las rutas guardadas: con muchas, las que de verdad se usan van primero.
  const [ordenPlantillas, setOrdenPlantillas] = useState('nombre');
  // Para buscar entre las rutas guardadas cuando ya hay muchas.
  const [busquedaPlantilla, setBusquedaPlantilla] = useState('');
  // La jornada a la que se le están agregando paradas con el camión andando.
  const [enCamino, setEnCamino] = useState(null);
  // Cómo está cada conductor hoy, para la tabla de Usuarios: sin esto había que abrir el perfil
  // de uno por uno para saber quién ya tiene rutas.
  const [hoyPorConductor, setHoyPorConductor] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [p, pts, pls] = await Promise.all([
        rutasApi.perfil(),
        rutasApi.puntos(),
        rutasApi.plantillas(),
      ]);
      setPerfil(p);
      setPuntos(pts);
      setPlantillas(pls);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  // Cambiar de cliente vuelve a cargar todo: la libreta, las rutas guardadas y los vehículos son
  // de ese cliente.
  useEffectAsync(cargar, [cargar, clienteId]);

  const filtros = Object.fromEntries(
    [...params.entries()].filter(([k]) => FILTROS_PERMITIDOS.includes(k)),
  );
  const pagina = Number(filtros.pagina ?? 1);
  const clave = new URLSearchParams(filtros).toString();

  // Cambiar un filtro vuelve a la primera página: quedarse en la página 4 de otra búsqueda
  // muestra una lista vacía que parece un error.
  const cambiarFiltros = useCallback(
    (cambios) => {
      setParams(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          Object.entries(cambios).forEach(([k, v]) =>
            v === '' || v == null ? nuevos.delete(k) : nuevos.set(k, v),
          );
          if (!('pagina' in cambios)) nuevos.delete('pagina');
          return nuevos;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // La búsqueda espera a que se termine de escribir: una consulta por letra no le sirve a nadie.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtros.q ?? '') !== busqueda.trim()) cambiarFiltros({ q: busqueda.trim() });
    }, 400);
    return () => clearTimeout(t);
  }, [busqueda, filtros.q, cambiarFiltros]);

  const cargarRutas = useCallback(async () => {
    try {
      const r = await rutasApi.jornadas({
        ...Object.fromEntries(new URLSearchParams(clave).entries()),
        porPagina: POR_PAGINA,
      });
      setJornadas(r.items);
      setTotalRutas(r.total);
      setTruncado(r.truncado);
      if (r.creadores) setCreadores(r.creadores);
    } catch (e) {
      setError(e.message);
    }
  }, [clave]);

  // Al cambiar de cliente se vuelve a pedir el perfil, y con el perfil nuevo la lista: la cabecera
  // del cliente la pone el cliente de la API en cada petición.
  useEffectAsync(async () => {
    if (seccion === 2 && perfil?.planifica) await cargarRutas();
  }, [seccion, perfil, cargarRutas]);

  useEffectAsync(async () => {
    if (seccion !== 3 || conductorId || !perfil?.planifica) return;
    try {
      const { conductores } = await rutasApi.disponibilidad({
        fecha: new Date().toLocaleDateString('en-CA'),
      });
      setHoyPorConductor(Object.fromEntries(conductores.map((c) => [c.id, c.rutas])));
    } catch {
      // La columna «Hoy» es una ayuda: si falla, la tabla sirve igual.
    }
  }, [seccion, conductorId, perfil]);

  // Quien solo conduce no tiene nada que planificar: va derecho a su ruta. El menú manda a
  // todos acá a propósito —así no tiene que averiguar quién es cada quien— y el reparto se
  // decide en un solo lugar, con el perfil que esta pantalla ya pidió.
  useEffect(() => {
    if (perfil && !perfil.planifica && perfil.conduce) {
      navigate('/mi-ruta', { replace: true });
    }
  }, [perfil, navigate]);

  const accion = async (fn) => {
    try {
      await fn();
      await Promise.all([cargar(), cargarRutas()]);
    } catch (e) {
      setError(e.message);
    }
  };

  // Los nombres del vehículo y del conductor ya vienen en el perfil: la lista solo trae ids,
  // y una tabla que muestra «51» en vez de «Hilux PBM 4521» no le sirve a nadie.
  const nombreVehiculo = useMemo(() => {
    const porId = new Map((perfil?.vehiculos ?? []).map((v) => [v.id, v.nombre]));
    return (id) => porId.get(id) ?? `Vehículo ${id}`;
  }, [perfil]);

  const nombreConductor = useMemo(() => {
    const porId = new Map((perfil?.conductores ?? []).map((c) => [c.id, c.nombre]));
    return (id) => (id ? (porId.get(id) ?? `Usuario ${id}`) : 'Sin asignar');
  }, [perfil]);

  // «Ruta 1 de 2»: qué lugar ocupa cada jornada en el día de su vehículo. Un reparto puede
  // salir dos o tres veces —la segunda arranca cuando vuelve la primera— y sin esto la lista
  // eran filas sueltas que no se sabía en qué orden pasaban.
  const ordenDelDia = useMemo(() => {
    const grupos = new Map();
    jornadas.forEach((j) => {
      const clave = `${j.fecha}|${j.traccarDeviceId}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(j);
    });
    const mapa = new Map();
    grupos.forEach((lista) => {
      if (lista.length < 2) return;
      lista
        .sort(
          (a, b) =>
            new Date(a.paradas[0]?.horaEstimada ?? 0) - new Date(b.paradas[0]?.horaEstimada ?? 0),
        )
        .forEach((j, i) => mapa.set(j.id, { numero: i + 1, total: lista.length }));
    });
    return mapa;
  }, [jornadas]);

  // Cada pedazo de una ruta se dibuja una vez y lo usan la fila de la tabla (escritorio) y la
  // tarjeta (teléfono): así las dos vistas no se desincronizan.
  const tituloJornada = (j) => (
    <>
      <Typography variant="body2" fontWeight={600}>
        {j.nombre || `Ruta del ${fecha(j.fecha)}`}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {fecha(j.fecha)} · salió {hora(j.paradas[0]?.horaEstimada)}
      </Typography>
      {ordenDelDia.has(j.id) && (
        <Chip
          size="small"
          variant="outlined"
          sx={{ height: 18, fontSize: '0.62rem', mt: 0.25 }}
          label={`Ruta ${ordenDelDia.get(j.id).numero} de ${ordenDelDia.get(j.id).total} del día`}
        />
      )}
    </>
  );

  const situacionJornada = (j) => (
    <>
      <Chip
        size="small"
        label={j.resumen?.situacion?.texto ?? j.estado}
        color={COLOR_SITUACION[j.resumen?.situacion?.clave] ?? 'default'}
      />
      {j.resumen?.conAtraso > 0 && (
        <Typography variant="caption" color="warning.main" display="block">
          {j.resumen.atrasoMaximoMinutos} min de atraso
        </Typography>
      )}
    </>
  );

  const avanceJornada = (j) => {
    const r = j.resumen;
    return (
      <>
        <LinearProgress
          variant="determinate"
          value={r?.total ? (100 * r.cumplidas) / r.total : 0}
          sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
        />
        <Typography variant="caption" color="text.secondary">
          {r?.cumplidas ?? 0} de {r?.total ?? j.paradas.length} paradas
        </Typography>
      </>
    );
  };

  const accionesJornada = (j) =>
    // Un administrador mirando todos: despachar, cerrar o repetir necesitan saber para qué cliente
    // es. En vez de botones que el servidor rechazaría, uno que lo lleva a ese cliente.
    viendoTodos ? (
      <>
        {j.estado !== 'borrador' && (
          <Button size="small" onClick={() => navigate(`/mi-ruta?jornada=${j.id}`)}>
            Seguir
          </Button>
        )}
        <Button size="small" onClick={() => navigate(`/rutas/${j.id}`)}>
          Detalle
        </Button>
        {j.cliente && (
          <Tooltip
            title={`Trabajar en ${j.cliente.nombre} para despachar, cerrar o repetir esta ruta`}
          >
            <Button size="small" onClick={() => guardarClienteAdmin(j.cliente)}>
              Elegir cliente
            </Button>
          </Tooltip>
        )}
      </>
    ) : (
      <>
        {j.estado === 'borrador' && (
          <Button size="small" onClick={() => accion(() => rutasApi.despachar(j.id))}>
            Despachar
          </Button>
        )}
        {j.estado !== 'borrador' && (
          <Button size="small" onClick={() => navigate(`/mi-ruta?jornada=${j.id}`)}>
            Seguir
          </Button>
        )}
        {/* Solo con la ruta en curso: en borrador se cambia en el planificador, y cerrada
          ya no hay nada que recalcular. */}
        {j.estado === 'despachada' && (
          <Tooltip title="Agregar paradas recalculando desde donde está el vehículo">
            <Button size="small" onClick={() => setEnCamino(j)}>
              + Paradas
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Cargar estas mismas paradas para asignarlas a otro vehículo o conductor">
          <Button
            size="small"
            onClick={() => {
              setPrecarga({
                nombre: j.nombre ?? '',
                puntoIds: j.paradas.map((x) => x.punto.id),
              });
              irA(1);
            }}
          >
            Repetir
          </Button>
        </Tooltip>
        <Button size="small" onClick={() => navigate(`/rutas/${j.id}`)}>
          Detalle
        </Button>
        {j.estado === 'despachada' && (
          <Button size="small" onClick={() => accion(() => rutasApi.cerrar(j.id))}>
            Cerrar
          </Button>
        )}
      </>
    );

  const filaJornada = (j) => (
    <TableRow key={j.id} hover>
      <TableCell>{tituloJornada(j)}</TableCell>
      {viendoTodos && <TableCell>{j.cliente?.nombre ?? '—'}</TableCell>}
      <TableCell>{nombreVehiculo(j.traccarDeviceId)}</TableCell>
      <TableCell>{nombreConductor(j.conductorUserId)}</TableCell>
      <TableCell>{situacionJornada(j)}</TableCell>
      <TableCell sx={{ minWidth: 120 }}>{avanceJornada(j)}</TableCell>
      <TableCell align="right">{j.distanciaKm != null ? `${j.distanciaKm} km` : '—'}</TableCell>
      <TableCell align="right">
        {duracion(j.minutosEstimados)}
        <Typography variant="caption" color="text.secondary" display="block">
          libre {hora(finDe(j))}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {accionesJornada(j)}
      </TableCell>
    </TableRow>
  );

  const tarjetaJornada = (j) => (
    <Paper key={j.id} variant="outlined" className={classes.tarjeta}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <div>{tituloJornada(j)}</div>
        <Stack alignItems="flex-end">{situacionJornada(j)}</Stack>
      </Stack>
      {viendoTodos && j.cliente && (
        <Typography variant="caption" color="primary" display="block" sx={{ mt: 1 }}>
          {j.cliente.nombre}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: viendoTodos ? 0.25 : 1 }}>
        {nombreVehiculo(j.traccarDeviceId)} · {nombreConductor(j.conductorUserId)}
      </Typography>
      <div style={{ marginTop: 8 }}>{avanceJornada(j)}</div>
      <Typography variant="caption" color="text.secondary" display="block">
        {j.distanciaKm != null ? `${j.distanciaKm} km` : '—'} · {duracion(j.minutosEstimados)} ·
        libre {hora(finDe(j))}
      </Typography>
      <div className={classes.botones}>{accionesJornada(j)}</div>
    </Paper>
  );

  // Agrupadas por día, que es como se trabaja: nadie pregunta «cuáles rutas hay», pregunta
  // «qué hay para el martes». La lista ya viene ordenada de la más reciente hacia atrás.
  const porFecha = useMemo(() => {
    const mapa = new Map();
    jornadas.forEach((j) => {
      if (!mapa.has(j.fecha)) mapa.set(j.fecha, []);
      mapa.get(j.fecha).push(j);
    });
    return [...mapa.entries()];
  }, [jornadas]);

  const plantillasVisibles = plantillas
    .filter((pl) =>
      `${pl.nombre} ${pl.puntos.map((x) => x.nombre).join(' ')}`
        .toLowerCase()
        .includes(busquedaPlantilla.trim().toLowerCase()),
    )
    .sort(ORDEN_PLANTILLAS[ordenPlantillas]);

  const usoDePlantilla = (pl) =>
    pl.usos
      ? `Usada ${pl.usos} ${pl.usos === 1 ? 'vez' : 'veces'} · la última el ${fecha(pl.ultimoUso)}`
      : 'Todavía no se usó';

  const accionesPlantilla = (pl) => (
    <>
      <Tooltip title="Cargarla para asignarle vehículo, conductor y fecha">
        <Button
          size="small"
          onClick={() => {
            setPrecarga({ nombre: pl.nombre, puntoIds: pl.puntos.map((x) => x.id) });
            irA(1);
          }}
        >
          Usar
        </Button>
      </Tooltip>
      <Button
        size="small"
        onClick={() => {
          setPrecarga({
            nombre: pl.nombre,
            puntoIds: pl.puntos.map((x) => x.id),
            plantillaId: pl.id,
          });
          irA(1);
        }}
      >
        Editar
      </Button>
      <Button
        size="small"
        color="error"
        onClick={() => accion(() => rutasApi.borrarPlantilla(pl.id))}
      >
        Borrar
      </Button>
    </>
  );

  const rolDeUsuario = (c) => (
    <Chip
      size="small"
      label={c.rol === 'encargado' ? 'Encargado' : 'Conductor'}
      color={c.rol === 'encargado' ? 'primary' : 'default'}
    />
  );

  // El horario es del conductor: con él, el planificador avisa cuando una ruta se le pasa de la
  // hora. Un encargado no maneja.
  const horarioDeUsuario = (c) => {
    if (c.rol === 'encargado') return '—';
    return c.entra && c.sale ? `${c.entra} a ${c.sale}` : 'Sin definir';
  };

  const hoyDeUsuario = (c) => {
    if (c.rol !== 'conductor') return '—';
    const hoy = hoyPorConductor[c.id];
    if (!hoy?.length) return 'Libre';
    return `${hoy.length} ${hoy.length === 1 ? 'ruta' : 'rutas'} · ${hora(hoy[0].salida)} a ${hora(hoy.at(-1).fin)}`;
  };

  const puedeUsuario = (c) =>
    c.rol === 'encargado'
      ? 'Arma rutas y ve el avance de tus vehículos, igual que vos.'
      : 'Ve solo la ruta que se le asigna y marca sus entregas.';

  // Solo la cuenta principal del cliente administra a su gente. Un encargado planifica, pero no
  // da de alta ni de baja: el servidor lo rechaza igual, esto solo evita ofrecer un botón que no
  // anda.
  const accionesUsuario = (c) =>
    perfil?.gestionaUsuarios && (
      <span onClick={(ev) => ev.stopPropagation()}>
        <Button size="small" onClick={() => setUsuarioEditado(c)}>
          Editar
        </Button>
        <Button
          size="small"
          color="error"
          onClick={() => accion(() => rutasApi.borrarConductor(c.id))}
        >
          Eliminar
        </Button>
      </span>
    );

  // Sin vehículos con el servicio no hay nada que planificar. Se dice por qué y a quién
  // preguntarle, en vez de mostrar una pantalla vacía que parece rota.
  const sinServicio = perfil && !perfil.planifica;
  // Mis rutas, Planificar y Usuarios son de UNA cuenta: un administrador mirando todos tiene que
  // elegir el cliente primero. Rutas cargadas y Avisos sí se pueden mirar sin elegir.
  const requiereCliente = viendoTodos && [0, 1, 3].includes(seccion);
  // Introducción guiada: sola la primera vez que alguien que planifica entra a Rutas.
  const tour = useTour('rutas', Boolean(perfil?.planifica && !requiereCliente));

  // Con un id en la URL se muestra esa jornada en el mapa. Conserva el menú de la izquierda
  // porque se llega desde «Rutas cargadas»: salir del detalle es elegir otra cosa ahí mismo,
  // sin tener que adivinar a dónde lleva el botón de atrás.
  if (id) {
    return (
      <PageLayout menu={<RutasMenu />} breadcrumbs={['Rutas', 'Detalle de la ruta']}>
        <div className={classes.cuerpo}>
          <JornadaMapa jornadaId={id} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      menu={
        <div data-tour="menu">
          <RutasMenu />
        </div>
      }
      breadcrumbs={['Rutas']}
    >
      {admin && <SelectorCliente servicio="rutas" cliente={clienteElegido} />}
      {perfil?.planifica && !requiereCliente && (
        <BarraIntroduccion demo={perfil.demo} onAbrir={tour.abrir} />
      )}
      <TourGuiado
        abierto={tour.abierto}
        onCerrar={tour.cerrar}
        pasos={pasosRutas({
          planifica: perfil?.planifica,
          gestionaUsuarios: perfil?.gestionaUsuarios,
          demo: perfil?.demo,
        })}
      />
      {cargando && <LinearProgress />}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* El administrador ve el módulo aunque ningún vehículo lo tenga: a él no le sirve
          «escribinos», le sirve saber dónde se activa. */}
      {sinServicio &&
        (admin ? (
          <Alert severity="info" sx={{ m: 2 }}>
            {clienteId
              ? `${clienteElegido.nombre} no tiene Rutas activado en ningún vehículo.`
              : 'Ningún vehículo tiene Rutas activado todavía.'}{' '}
            Se activa desde el panel admin, agregando el plan «Rutas» al contrato del cliente: el
            servicio se enciende solo en los vehículos de ese contrato.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ m: 2 }}>
            Ninguno de tus vehículos tiene contratado el servicio de Rutas. Escribinos para
            activarlo.
          </Alert>
        ))}

      {requiereCliente && !sinServicio && (
        <Alert severity="info" sx={{ m: 2 }}>
          Elegí un cliente arriba para ver sus rutas guardadas, planificar o administrar a su gente.
          Lo que armes queda a nombre de ese cliente y él lo ve como suyo.
        </Alert>
      )}

      {perfil?.planifica && !requiereCliente && (
        // La clave hace que cambiar de cliente arranque cada sección de cero: sin eso, el
        // planificador conservaría el vehículo o las paradas del cliente anterior.
        <div className={classes.cuerpo} key={clienteId ?? 'todos'} data-tour="contenido">
          {seccion === 0 && (
            <>
              {plantillas.length > 1 && (
                <Stack direction="row" sx={{ p: 2, pb: 1, flexWrap: 'wrap', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Buscar una ruta guardada"
                    value={busquedaPlantilla}
                    onChange={(e) => setBusquedaPlantilla(e.target.value)}
                    sx={{ minWidth: 280, flexGrow: 1, maxWidth: 420 }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Orden"
                    value={ordenPlantillas}
                    onChange={(e) => setOrdenPlantillas(e.target.value)}
                    sx={{ minWidth: 200 }}
                  >
                    <MenuItem value="nombre">Por nombre (A–Z)</MenuItem>
                    <MenuItem value="usos">Las más usadas</MenuItem>
                    <MenuItem value="reciente">Usadas recientemente</MenuItem>
                  </TextField>
                </Stack>
              )}
              {angosta ? (
                <div className={classes.tarjetas}>
                  {plantillasVisibles.map((pl) => (
                    <Paper key={pl.id} variant="outlined" className={classes.tarjeta}>
                      <Typography variant="body2" fontWeight={600}>
                        {pl.nombre}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {usoDePlantilla(pl)}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 1 }}
                      >
                        {pl.puntos.length} paradas: {pl.puntos.map((x) => x.nombre).join(' → ')}
                      </Typography>
                      <div className={classes.botones}>{accionesPlantilla(pl)}</div>
                    </Paper>
                  ))}
                  {plantillas.length === 0 && !cargando && (
                    <Typography variant="body2" color="text.secondary">
                      {SIN_PLANTILLAS}
                    </Typography>
                  )}
                </div>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ruta</TableCell>
                      <TableCell>Paradas</TableCell>
                      <TableCell>Recorrido</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plantillasVisibles.map((pl) => (
                      <TableRow key={pl.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {pl.nombre}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {usoDePlantilla(pl)}
                          </Typography>
                        </TableCell>
                        <TableCell>{pl.puntos.length}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {pl.puntos.map((x) => x.nombre).join(' → ')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {accionesPlantilla(pl)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {plantillas.length === 0 && !cargando && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            {SIN_PLANTILLAS}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {seccion === 1 && (
            <PlanificarRuta
              perfil={perfil}
              puntos={puntos}
              plantillas={plantillas}
              precarga={precarga}
              onPrecargaUsada={() => setPrecarga(null)}
              onCambio={cargar}
            />
          )}

          {seccion === 4 && <Avisos />}

          {seccion === 3 && conductorId && <ConductorFicha conductorId={Number(conductorId)} />}

          {seccion === 3 && !conductorId && (
            <>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ p: 2, pb: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Conductores y encargados de tu cuenta.
                </Typography>
                {perfil?.gestionaUsuarios && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setNuevoUsuario(true)}
                  >
                    Agregar usuario
                  </Button>
                )}
              </Stack>
              {angosta ? (
                <div className={classes.tarjetas}>
                  {(perfil?.conductores ?? []).map((c) => (
                    <Paper
                      key={c.id}
                      variant="outlined"
                      className={classes.tarjeta}
                      sx={c.rol === 'conductor' ? { cursor: 'pointer' } : undefined}
                      onClick={
                        c.rol === 'conductor'
                          ? () => navigate(`/rutas/usuarios/${c.id}`)
                          : undefined
                      }
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        spacing={1}
                      >
                        <div>
                          <Typography variant="body2" fontWeight={600}>
                            {c.nombre}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ wordBreak: 'break-all' }}
                          >
                            {c.correo}
                          </Typography>
                        </div>
                        {rolDeUsuario(c)}
                      </Stack>
                      {c.rol === 'conductor' && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          sx={{ mt: 1 }}
                        >
                          Horario: {horarioDeUsuario(c)} · Hoy: {hoyDeUsuario(c)}
                        </Typography>
                      )}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ mt: 0.5 }}
                      >
                        {puedeUsuario(c)}
                      </Typography>
                      <div className={classes.botones}>
                        {c.rol === 'conductor' && <Button size="small">Ver perfil</Button>}
                        {accionesUsuario(c)}
                      </div>
                    </Paper>
                  ))}
                  {(perfil?.conductores ?? []).length === 0 && !cargando && (
                    <Typography variant="body2" color="text.secondary">
                      {SIN_USUARIOS}
                    </Typography>
                  )}
                </div>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Usuario</TableCell>
                      <TableCell>Entra con</TableCell>
                      <TableCell>Rol</TableCell>
                      <TableCell>Horario</TableCell>
                      <TableCell>Hoy</TableCell>
                      <TableCell>Qué puede hacer</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(perfil?.conductores ?? []).map((c) => (
                      <TableRow
                        key={c.id}
                        hover
                        // El perfil es de los conductores: un encargado no maneja, no hay semana ni
                        // entregas que mostrar.
                        sx={c.rol === 'conductor' ? { cursor: 'pointer' } : undefined}
                        onClick={
                          c.rol === 'conductor'
                            ? () => navigate(`/rutas/usuarios/${c.id}`)
                            : undefined
                        }
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {c.nombre}
                          </Typography>
                          {c.rol === 'conductor' && (
                            <Typography variant="caption" color="primary">
                              Ver perfil
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{c.correo}</TableCell>
                        <TableCell>{rolDeUsuario(c)}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {horarioDeUsuario(c)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {hoyDeUsuario(c)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {puedeUsuario(c)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {accionesUsuario(c)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(perfil?.conductores ?? []).length === 0 && !cargando && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography variant="body2" color="text.secondary">
                            {SIN_USUARIOS}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {seccion === 2 && (
            <>
              <FiltrosRutas
                filtros={filtros}
                onCambiar={cambiarFiltros}
                busqueda={busqueda}
                onBuscar={setBusqueda}
                vehiculos={perfil?.vehiculos ?? []}
                conductores={(perfil?.conductores ?? []).filter((c) => c.rol === 'conductor')}
                creadores={creadores}
                total={totalRutas}
                truncado={truncado}
              />
              {angosta ? (
                <div className={classes.tarjetas}>
                  {!filtros.orden || filtros.orden.startsWith('fecha')
                    ? porFecha.map(([f, lista]) => (
                        <Fragment key={f}>
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            {fecha(f)} · {lista.length} {lista.length === 1 ? 'ruta' : 'rutas'}
                          </Typography>
                          {lista.map((j) => tarjetaJornada(j))}
                        </Fragment>
                      ))
                    : jornadas.map((j) => tarjetaJornada(j))}
                  {jornadas.length === 0 && !cargando && (
                    <Typography variant="body2" color="text.secondary">
                      {clave
                        ? 'Ninguna ruta coincide con lo que buscás.'
                        : 'Todavía no hay rutas. Armá una en «Planificar».'}
                    </Typography>
                  )}
                </div>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ruta</TableCell>
                      {viendoTodos && <TableCell>Cliente</TableCell>}
                      <TableCell>Vehículo</TableCell>
                      <TableCell>Conductor</TableCell>
                      <TableCell>Situación</TableCell>
                      <TableCell>Avance</TableCell>
                      <TableCell align="right">Distancia</TableCell>
                      <TableCell align="right">Tiempo</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!filtros.orden || filtros.orden.startsWith('fecha')
                      ? porFecha.map(([f, lista]) => (
                          <Fragment key={f}>
                            {/* Un encabezado por día: con treinta rutas, saber dónde termina el
                                martes y empieza el miércoles es la mitad de la lectura. */}
                            <TableRow>
                              <TableCell
                                colSpan={viendoTodos ? 9 : 8}
                                sx={{ backgroundColor: 'action.hover', py: 0.5 }}
                              >
                                <Typography variant="caption" fontWeight={600}>
                                  {fecha(f)} · {lista.length}{' '}
                                  {lista.length === 1 ? 'ruta' : 'rutas'}
                                </Typography>
                              </TableCell>
                            </TableRow>
                            {lista.map((j) => filaJornada(j))}
                          </Fragment>
                        ))
                      : jornadas.map((j) => filaJornada(j))}
                    {jornadas.length === 0 && !cargando && (
                      <TableRow>
                        <TableCell colSpan={viendoTodos ? 9 : 8}>
                          <Typography variant="body2" color="text.secondary">
                            {clave
                              ? 'Ninguna ruta coincide con lo que buscás.'
                              : 'Todavía no hay rutas. Armá una en «Planificar».'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
              {totalRutas > POR_PAGINA && (
                <Stack alignItems="center" sx={{ py: 2 }}>
                  <Pagination
                    count={Math.ceil(totalRutas / POR_PAGINA)}
                    page={pagina}
                    onChange={(_e, n) => cambiarFiltros({ pagina: n === 1 ? '' : String(n) })}
                  />
                </Stack>
              )}
            </>
          )}
        </div>
      )}
      <AgregarParadasDialog
        open={Boolean(enCamino)}
        jornada={enCamino}
        puntos={puntos}
        onClose={() => setEnCamino(null)}
        onAplicado={() => Promise.all([cargar(), cargarRutas()])}
      />
      <NuevoUsuarioDialog
        open={nuevoUsuario}
        onClose={() => setNuevoUsuario(false)}
        onCreado={cargar}
      />
      <NuevoUsuarioDialog
        open={Boolean(usuarioEditado)}
        usuario={usuarioEditado}
        onClose={() => setUsuarioEditado(null)}
        onCreado={cargar}
      />
    </PageLayout>
  );
};

export default RutasPage;
