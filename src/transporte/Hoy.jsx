// Hoy: cada recorrido como una tira recta con sus paradas —como un mapa de metro— y los buses
// encima. Verde en ruta, ámbar detrás de lo esperado, rojo desviado, gris sin datos.
//
// Es la pantalla principal por una razón (TRANSPORTE.md §9): sobre un mapa, 20 buses de 5 líneas
// son puntos sueltos; en una tira se lee sin leer quién va pegado a quién y quién va atrás. Se
// refresca cada 15 s. Tocar un bus abre su viaje.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import { Alert, Box, Chip, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import transporteApi from './api';

const REFRESCO_MS = 15_000;

const useStyles = makeStyles()((theme) => ({
  tira: {
    position: 'relative',
    height: 64,
    margin: theme.spacing(2, 1.5, 1),
  },
  riel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.palette.action.selected,
  },
  parada: {
    position: 'absolute',
    top: 36,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: '50%',
    border: `2px solid ${theme.palette.background.paper}`,
    backgroundColor: theme.palette.text.disabled,
    boxSizing: 'border-box',
  },
  terminal: { backgroundColor: theme.palette.error.main },
  paradaHecha: { backgroundColor: theme.palette.success.main },
  paradaSaltada: { backgroundColor: theme.palette.warning.main },
  bus: {
    position: 'absolute',
    top: 2,
    width: 30,
    height: 30,
    marginLeft: -15,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.palette.common.white,
    cursor: 'pointer',
    boxShadow: theme.shadows[2],
    transition: 'left 1s linear',
    '& svg': { fontSize: 18 },
  },
  etiqueta: {
    position: 'absolute',
    top: 52,
    transform: 'translateX(-50%)',
    fontSize: '0.62rem',
    whiteSpace: 'nowrap',
    color: theme.palette.text.secondary,
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}));

const COLOR = {
  en_ruta: 'success.main',
  atrasado: 'warning.main',
  desviado: 'error.main',
  sin_datos: 'text.disabled',
  programado: 'action.disabled',
  terminado: 'text.disabled',
};

const TEXTO = {
  en_ruta: 'En ruta',
  atrasado: 'Va detrás de lo esperado',
  desviado: 'Desviado',
  sin_datos: 'Sin datos suficientes',
  programado: 'Todavía no sale',
  terminado: 'Terminó',
};

const hora = (d) =>
  d ? new Date(d).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

/// Fase 8: frecuencia real entre buses de un recorrido, medida en la primera parada.
const FrecuenciaLinea = ({ frecuencia: f }) => {
  if (!f || f.intervalos.length === 0 || f.promedioMin == null) return null;
  return (
    <Typography
      variant="caption"
      color={f.amontonados ? 'warning.main' : 'text.secondary'}
      sx={{ px: 1.5, pb: 1.5, display: 'block' }}
    >
      Pasan cada {f.promedioMin} min
      {f.programadoMin ? ` (programado cada ${f.programadoMin})` : ''}
      {f.amontonados > 0 &&
        ` · ${f.amontonados} ${f.amontonados === 1 ? 'par de buses va' : 'pares de buses van'} amontonados`}
    </Typography>
  );
};

const Hoy = ({ perfil, primerosPasos }) => {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await transporteApi.hoy();
        if (vivo) {
          setDatos(r);
          setError('');
        }
      } catch (e) {
        if (vivo) setError(e.message);
      }
    };
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [perfil?.clienteElegido?.id]);

  if (!datos && !error) return <LinearProgress />;
  if (error)
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );

  // Sin viajes hoy, la pantalla sigue siendo la de los primeros pasos: es lo que dice qué
  // falta armar. Con viajes, las tiras.
  if (datos.viajes.length === 0) return primerosPasos;

  // Una tira por variante; los buses de esa variante encima.
  const porVariante = new Map();
  for (const v of datos.viajes) {
    const clave = v.variante.id;
    const grupo = porVariante.get(clave) ?? {
      linea: v.linea,
      variante: v.variante,
      paradas: v.paradas,
      viajes: [],
    };
    grupo.viajes.push(v);
    porVariante.set(clave, grupo);
  }

  const pct = (metro, total) =>
    `${Math.min(100, Math.max(0, (metro / Math.max(1, total)) * 100))}%`;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1100 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5" component="h1" fontWeight={600}>
          Hoy
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Actualizado {hora(datos.ahora)} · cada 15 s
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {['en_ruta', 'atrasado', 'desviado', 'sin_datos'].map((s) => (
          <Stack key={s} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLOR[s] }} />
            <Typography variant="caption" color="text.secondary">
              {TEXTO[s]}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Stack spacing={2}>
        {[...porVariante.values()].map((g) => (
          <Paper key={g.variante.id} variant="outlined">
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: 1.5, pt: 1 }}
            >
              <Typography fontWeight={600}>
                {g.linea.nombre}{' '}
                <Typography component="span" color="text.secondary">
                  · {g.variante.nombre}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {g.viajes.length === 1 ? '1 bus' : `${g.viajes.length} buses`} ·{' '}
                {(g.variante.metros / 1000).toFixed(1)} km
              </Typography>
            </Stack>

            <div className={classes.tira}>
              <div className={classes.riel} />
              {g.paradas.map((p) => {
                // La parada toma el estado del primer bus que ya la pasó: en una tira con
                // varios buses, lo que importa es si alguien la saltó.
                const resultados = g.viajes.map(
                  (v) => v.paradas.find((x) => x.id === p.id)?.resultado,
                );
                const saltada = resultados.includes('paso_sin_detenerse');
                const hecha = !saltada && resultados.includes('se_detuvo');
                return (
                  <Tooltip key={p.id} title={`${p.orden}. ${p.nombre}`} arrow>
                    <div
                      className={cx(
                        classes.parada,
                        p.terminal && classes.terminal,
                        hecha && classes.paradaHecha,
                        saltada && classes.paradaSaltada,
                      )}
                      style={{ left: pct(p.metroEnLinea, g.variante.metros) }}
                    />
                  </Tooltip>
                );
              })}
              {g.paradas
                .filter((p, i) => p.terminal || i === 0 || i === g.paradas.length - 1)
                .map((p) => (
                  <span
                    key={`e-${p.id}`}
                    className={classes.etiqueta}
                    style={{ left: pct(p.metroEnLinea, g.variante.metros) }}
                  >
                    {p.nombre}
                  </span>
                ))}
              {g.viajes.map((v) => {
                const metro =
                  v.avance?.metro ?? (v.situacion === 'terminado' ? g.variante.metros : 0);
                return (
                  <Tooltip
                    key={v.id}
                    arrow
                    title={`${v.vehiculo} · ${TEXTO[v.situacion]} · ${hora(v.inicio)}–${hora(v.fin)}${v.avance ? ` · km ${(v.avance.metro / 1000).toFixed(1)}` : ''}${v.desviosAbiertos ? ` · ${v.desviosAbiertos} desvío(s)` : ''}`}
                  >
                    <Box
                      className={classes.bus}
                      sx={{
                        bgcolor: COLOR[v.situacion],
                        left: pct(metro, g.variante.metros),
                        opacity: v.situacion === 'programado' ? 0.5 : 1,
                      }}
                      onClick={() => navigate(`/transporte/viajes/${v.id}`)}
                      role="button"
                      aria-label={`${v.vehiculo}: ${TEXTO[v.situacion]}`}
                    >
                      <DirectionsBusIcon />
                    </Box>
                  </Tooltip>
                );
              })}
            </div>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ px: 1.5, pb: 1.5 }}>
              {g.viajes.map((v) => (
                <Chip
                  key={v.id}
                  size="small"
                  icon={<DirectionsBusIcon />}
                  label={`${v.vehiculo} · ${TEXTO[v.situacion]}${v.aptitudNivel === 'insuficiente' ? ' (equipo)' : ''}`}
                  onClick={() => navigate(`/transporte/viajes/${v.id}`)}
                  sx={{ '& .MuiChip-icon': { color: COLOR[v.situacion] } }}
                />
              ))}
            </Stack>
            <FrecuenciaLinea
              frecuencia={(datos.frecuencias ?? []).find((x) => x.varianteId === g.variante.id)}
            />
          </Paper>
        ))}
      </Stack>

      {(datos.vueltas ?? []).length > 0 && (
        <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Vueltas de hoy por bus
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {datos.vueltas.map((b) => (
              <Chip
                key={b.vehiculo}
                size="small"
                variant="outlined"
                label={`${b.vehiculo}: ${b.hechas} de ${b.programadas}${b.sinDatos ? ` · ${b.sinDatos} sin datos` : ''}`}
              />
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
};

export default Hoy;
