// El perfil de un conductor, visto desde la oficina.
//
// Contesta tres preguntas en el orden en que se hacen:
//   1. ¿Cómo viene trabajando este mes? — cuatro cifras, cada una contra el mes anterior.
//   2. ¿Se puede confiar en lo que reporta? — cómo se supo que estuvo en cada parada.
//   3. ¿Qué tiene esta semana y qué le viene? — su semana dibujada y sus próximas rutas.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';
import {
  Paper,
  Typography,
  Stack,
  IconButton,
  Chip,
  Alert,
  LinearProgress,
  Tooltip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import rutasApi from './api';
import { useEffectAsync } from '../reactHelper';

// Cómo se supo que el vehículo estuvo en la parada, de la prueba más fuerte a la más débil. Los
// colores son los cuatro primeros de la paleta categórica, validados para daltonismo en los dos
// modos; en modo claro dos quedan con poco contraste, por eso cada tramo lleva su cantidad y su
// nombre escritos al lado, nunca solo el color.
const COMO_LLEGO = [
  { clave: 'motor_apagado', nombre: 'Apagó el motor', claro: '#2a78d6', oscuro: '#3987e5' },
  { clave: 'estacionado', nombre: 'Se estacionó', claro: '#eb6834', oscuro: '#d95926' },
  {
    clave: 'conductor',
    nombre: 'Lo marcó el conductor con el GPS ahí',
    claro: '#1baf7a',
    oscuro: '#199e70',
  },
  { clave: 'sin_gps', nombre: 'Sin llegada por GPS', claro: '#eda100', oscuro: '#c98500' },
];

const useStyles = makeStyles()((theme) => ({
  tiras: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: theme.spacing(1.5),
    [theme.breakpoints.down('md')]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  },
  tira: { padding: theme.spacing(1.5, 2) },
  etiqueta: { fontSize: '0.78rem', color: theme.palette.text.secondary },
  valor: { fontSize: '1.8rem', fontWeight: 600, lineHeight: 1.15 },
  barra: {
    display: 'flex',
    gap: 2,
    height: 18,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.palette.background.paper,
  },
  tramo: { minWidth: 4, cursor: 'default' },
  muestra: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  // La semana: una fila por día sobre la misma escala de horas, así se comparan los días de un
  // vistazo en vez de leer siete listas.
  fila: {
    display: 'grid',
    gridTemplateColumns: '72px 1fr',
    alignItems: 'center',
    gap: theme.spacing(1),
    minHeight: 30,
  },
  pista: {
    position: 'relative',
    height: 24,
    borderRadius: 4,
    backgroundColor: theme.palette.action.hover,
    overflow: 'hidden',
  },
  horario: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.palette.action.selected,
  },
  bloque: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 4,
    padding: theme.spacing(0, 0.75),
    fontSize: '0.66rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  despachada: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  cerrada: { backgroundColor: theme.palette.grey[500], color: theme.palette.common.white },
  borrador: {
    border: `2px dashed ${theme.palette.primary.main}`,
    color: theme.palette.text.primary,
  },
  hoy: { fontWeight: 700 },
}));

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';
const nombreMes = (mes) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' });
const diaCorto = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric' });
const diaLargo = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
const duracion = (min) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// Mover un mes o una semana. Fuera del componente: trabaja con fechas y el render tiene que ser puro.
const otroMes = (mes, salto) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + salto, 1));
  return d.toISOString().slice(0, 7);
};
const otraSemana = (desde, salto) => {
  const d = new Date(`${desde}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * salto);
  return d.toISOString().slice(0, 10);
};
const minutosDelDia = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const deTexto = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hoyTexto = () => new Date().toLocaleDateString('en-CA');

/**
 * Una cifra del mes con su comparación. El color de la diferencia depende de si subir es bueno:
 * más entregas a tiempo es bueno, más tiempo fuera de horario no. Si no hay mes anterior con
 * qué comparar, no se inventa una diferencia.
 */
const Tira = ({ classes, etiqueta, valor, detalle, diferencia, subirEsBueno, unidad = '' }) => {
  let color = 'text.secondary';
  if (diferencia != null && diferencia !== 0 && subirEsBueno != null) {
    color = diferencia > 0 === subirEsBueno ? 'success.main' : 'error.main';
  }
  return (
    <Paper variant="outlined" className={classes.tira}>
      <Typography className={classes.etiqueta}>{etiqueta}</Typography>
      <Typography className={classes.valor}>{valor}</Typography>
      {detalle && (
        <Typography variant="caption" color="text.secondary" display="block">
          {detalle}
        </Typography>
      )}
      <Typography variant="caption" color={color} display="block">
        {diferencia == null
          ? 'sin mes anterior para comparar'
          : `${diferencia > 0 ? '+' : ''}${diferencia}${unidad} vs. mes anterior`}
      </Typography>
    </Paper>
  );
};

const ConductorFicha = ({ conductorId }) => {
  const { classes, cx } = useStyles();
  const theme = useTheme();
  const oscuro = theme.palette.mode === 'dark';
  const navigate = useNavigate();

  const [mes, setMes] = useState(null);
  const [semana, setSemana] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffectAsync(async () => {
    setCargando(true);
    try {
      const params = {};
      if (mes) params.mes = mes;
      if (semana) params.semana = semana;
      setFicha(await rutasApi.fichaConductor(conductorId, params));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [conductorId, mes, semana]);

  const volver = (
    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/rutas/usuarios')}>
      Usuarios
    </Button>
  );

  if (!ficha) {
    return (
      <Stack sx={{ p: 2 }} spacing={2}>
        {volver}
        {cargando && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    );
  }

  const { conductor, estadisticas: e, anterior: a } = ficha;
  const hayAnterior = a.rutas > 0;
  const resueltas = e.entregadas + e.noEntregadas;
  const resueltasAnt = a.entregadas + a.noEntregadas;
  const conHora = e.aTiempo + e.tarde;
  const conHoraAnt = a.aTiempo + a.tarde;
  const dif = (actual, previo) =>
    hayAnterior && actual != null && previo != null ? actual - previo : null;

  // La barra de «cómo se supo que llegó»: sobre las paradas que tienen algún dato.
  const totalLlegadas = COMO_LLEGO.reduce((t, c) => t + e.llegadaPor[c.clave], 0);

  // La escala de horas de la semana: lo que haya que mostrar, nunca menos que una jornada normal.
  const bloques = ficha.semana.dias.flatMap((d) => d.rutas).filter((r) => r.salida && r.fin);
  const horario =
    conductor.entra && conductor.sale
      ? { desde: deTexto(conductor.entra), hasta: deTexto(conductor.sale) }
      : null;
  let inicio = Math.min(
    ...bloques.map((r) => minutosDelDia(r.salida)),
    horario?.desde ?? 7 * 60,
    7 * 60,
  );
  let fin = Math.max(
    ...bloques.map((r) => minutosDelDia(r.fin)),
    horario?.hasta ?? 17 * 60,
    17 * 60,
  );
  inicio = Math.max(0, Math.floor(inicio / 60) * 60 - 60);
  fin = Math.min(24 * 60, Math.ceil(fin / 60) * 60 + 60);
  const total = fin - inicio;
  const pos = (desde, hasta) => ({
    left: `${((desde - inicio) / total) * 100}%`,
    width: `${Math.max(2, ((hasta - desde) / total) * 100)}%`,
  });
  const marcas = [];
  for (let m = inicio; m <= fin; m += 180) marcas.push(m);
  const hoy = hoyTexto();

  return (
    <Stack sx={{ p: 2, maxWidth: 1100 }} spacing={2}>
      {volver}
      {cargando && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5">{conductor.nombre}</Typography>
        <Chip size="small" label="Conductor" />
        <Chip
          size="small"
          variant="outlined"
          label={
            conductor.entra && conductor.sale
              ? `Horario ${conductor.entra}–${conductor.sale}`
              : 'Sin horario definido'
          }
        />
        <Typography variant="body2" color="text.secondary">
          {conductor.correo}
        </Typography>
      </Stack>

      {/* ── 1. El mes ───────────────────────────────────────────────────── */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton size="small" onClick={() => setMes(otroMes(ficha.mes, -1))}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography
          variant="subtitle1"
          sx={{ textTransform: 'capitalize', minWidth: 170, textAlign: 'center' }}
        >
          {nombreMes(ficha.mes)}
        </Typography>
        <IconButton size="small" onClick={() => setMes(otroMes(ficha.mes, 1))}>
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <div className={classes.tiras}>
        <Tira
          classes={classes}
          etiqueta="Rutas manejadas"
          valor={e.rutas}
          detalle={`${e.terminadas} terminadas · ${e.km} km planificados`}
          diferencia={dif(e.rutas, a.rutas)}
        />
        <Tira
          classes={classes}
          etiqueta="Entregas logradas"
          valor={pct(e.entregadas, resueltas) != null ? `${pct(e.entregadas, resueltas)}%` : '—'}
          detalle={`${e.entregadas} de ${resueltas} paradas resueltas`}
          diferencia={dif(pct(e.entregadas, resueltas), pct(a.entregadas, resueltasAnt))}
          subirEsBueno
          unidad=" pts"
        />
        <Tira
          classes={classes}
          etiqueta="Llegó a tiempo"
          valor={pct(e.aTiempo, conHora) != null ? `${pct(e.aTiempo, conHora)}%` : '—'}
          detalle={
            e.tarde
              ? `${e.tarde} tarde, ${e.atrasoPromedio} min en promedio`
              : 'hasta 10 min cuenta como a tiempo'
          }
          diferencia={dif(pct(e.aTiempo, conHora), pct(a.aTiempo, conHoraAnt))}
          subirEsBueno
          unidad=" pts"
        />
        <Tira
          classes={classes}
          etiqueta="Fuera de su horario"
          valor={e.minutosFueraDeHorario ? duracion(e.minutosFueraDeHorario) : '0'}
          detalle={
            conductor.sale
              ? `planificado después de las ${conductor.sale}`
              : 'sin horario, no se mide'
          }
          diferencia={conductor.sale ? dif(e.minutosFueraDeHorario, a.minutosFueraDeHorario) : null}
          subirEsBueno={false}
          unidad=" min"
        />
      </div>

      {/* ── 2. ¿Se puede confiar en lo que reporta? ──────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1">¿Se puede confiar en lo que reporta?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Cómo se supo que el vehículo estuvo en cada parada. Lo que confirma el GPS del carro no
          depende de que el conductor toque un botón.
        </Typography>

        {totalLlegadas === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Todavía no hay paradas resueltas este mes.
          </Typography>
        ) : (
          <>
            <div className={classes.barra} role="img" aria-label="Cómo se confirmaron las llegadas">
              {COMO_LLEGO.filter((c) => e.llegadaPor[c.clave] > 0).map((c) => (
                <Tooltip
                  key={c.clave}
                  title={`${c.nombre}: ${e.llegadaPor[c.clave]} (${pct(e.llegadaPor[c.clave], totalLlegadas)}%)`}
                >
                  <div
                    className={classes.tramo}
                    style={{
                      flexGrow: e.llegadaPor[c.clave],
                      backgroundColor: oscuro ? c.oscuro : c.claro,
                    }}
                  />
                </Tooltip>
              ))}
            </div>
            {/* La leyenda es también la tabla: cada tramo con su nombre, cantidad y parte. */}
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {COMO_LLEGO.map((c) => (
                <Stack key={c.clave} direction="row" alignItems="center" spacing={1}>
                  <span
                    className={classes.muestra}
                    style={{ backgroundColor: oscuro ? c.oscuro : c.claro }}
                  />
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {c.nombre}
                  </Typography>
                  {c.clave === 'sin_gps' && e.llegadaPor.sin_gps > 0 && (
                    <WarningAmberIcon fontSize="small" color="warning" />
                  )}
                  <Typography
                    variant="body2"
                    sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}
                  >
                    {e.llegadaPor[c.clave]} · {pct(e.llegadaPor[c.clave], totalLlegadas)}%
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        {/* Las señales que piden mirar más de cerca, dichas en palabras. */}
        <Stack spacing={1} sx={{ mt: 2 }}>
          {e.llegadaPor.sin_gps > 0 && (
            <Alert severity="warning">
              {e.llegadaPor.sin_gps}{' '}
              {e.llegadaPor.sin_gps === 1 ? 'parada marcada' : 'paradas marcadas'} sin que el GPS
              registrara la llegada. Puede ser un punto mal ubicado en el mapa o una parada que no
              se hizo: vale la pena preguntar.
            </Alert>
          )}
          {e.sinConfirmar > 0 && (
            <Alert severity="info">
              {e.sinConfirmar} {e.sinConfirmar === 1 ? 'vez llegó' : 'veces llegó'} por GPS y se fue
              sin decir qué pasó.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            {e.puntosCorregidos}{' '}
            {e.puntosCorregidos === 1 ? 'punto corregido' : 'puntos corregidos'} · {e.desvios}{' '}
            {e.desvios === 1 ? 'desvío de ruta' : 'desvíos de ruta'} · {e.noEntregadas}{' '}
            {e.noEntregadas === 1 ? 'entrega que no se pudo' : 'entregas que no se pudieron'}
          </Typography>
          {e.motivos.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {e.motivos.map((m) => (
                <Chip
                  key={m.motivo}
                  size="small"
                  variant="outlined"
                  label={`${m.motivo} · ${m.veces}`}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* ── 3. La semana ────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            Semana del {diaLargo(ficha.semana.desde)}
          </Typography>
          <IconButton size="small" onClick={() => setSemana(otraSemana(ficha.semana.desde, -1))}>
            <ChevronLeftIcon />
          </IconButton>
          <Button size="small" onClick={() => setSemana(hoyTexto())}>
            Esta semana
          </Button>
          <IconButton size="small" onClick={() => setSemana(otraSemana(ficha.semana.desde, 1))}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>

        <div className={classes.fila}>
          <span />
          <Stack direction="row" justifyContent="space-between">
            {marcas.map((m) => (
              <Typography
                key={m}
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: '0.62rem' }}
              >
                {`${Math.floor(m / 60) % 12 || 12} ${Math.floor(m / 60) < 12 ? 'am' : 'pm'}`}
              </Typography>
            ))}
          </Stack>
        </div>
        <Stack spacing={0.75}>
          {ficha.semana.dias.map((d) => (
            <div key={d.fecha} className={classes.fila}>
              <Typography
                variant="caption"
                className={cx(d.fecha === hoy && classes.hoy)}
                sx={{ textTransform: 'capitalize' }}
              >
                {diaCorto(d.fecha)}
              </Typography>
              <div className={classes.pista}>
                {horario && (
                  <div className={classes.horario} style={pos(horario.desde, horario.hasta)} />
                )}
                {d.rutas
                  .filter((r) => r.salida && r.fin)
                  .map((r) => (
                    <Tooltip
                      key={r.id}
                      title={`${r.nombre || 'Ruta sin nombre'} · ${hora(r.salida)} a ${hora(r.fin)} · ${
                        { borrador: 'sin despachar', despachada: 'despachada', cerrada: 'cerrada' }[
                          r.estado
                        ] ?? r.estado
                      }`}
                    >
                      <div
                        className={cx(classes.bloque, classes[r.estado])}
                        style={pos(minutosDelDia(r.salida), minutosDelDia(r.fin))}
                        onClick={() => navigate(`/rutas/${r.id}`)}
                      >
                        {r.nombre || hora(r.salida)}
                      </div>
                    </Tooltip>
                  ))}
              </div>
            </div>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Sólido: despachada · gris: cerrada · punteado: sin despachar · sombreado: su horario.
        </Typography>
      </Paper>

      {/* ── 4. Lo que le viene ──────────────────────────────────────────── */}
      <Paper variant="outlined">
        <Typography variant="subtitle1" sx={{ p: 2, pb: 1 }}>
          Próximas rutas
        </Typography>
        {ficha.proximas.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
            No tiene rutas cargadas de hoy en adelante.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Día</TableCell>
                <TableCell>Ruta</TableCell>
                <TableCell>Horas</TableCell>
                <TableCell>Vehículo</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ficha.proximas.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/rutas/${r.id}`)}
                >
                  <TableCell sx={{ textTransform: 'capitalize' }}>{diaCorto(r.fecha)}</TableCell>
                  <TableCell>
                    {r.nombre || 'Sin nombre'}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {r.paradas.length} paradas
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {hora(r.salida)} a {hora(r.fin)}
                  </TableCell>
                  <TableCell>{r.vehiculo}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.estado === 'despachada' ? 'Despachada' : 'Sin despachar'}
                      color={r.estado === 'despachada' ? 'primary' : 'default'}
                      variant={r.estado === 'despachada' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
};

export default ConductorFicha;
