// Una jornada en el mapa: el recorrido por calle y sus paradas, junto al detalle.
//
// Reutiliza los componentes de mapa de Traccar —MapView, MapRouteCoordinates, MapMarkers,
// MapCamera— en vez de traer otra librería. Así la ruta se ve con el mismo trazo, el mismo
// grosor y la misma capa base que el resto de la aplicación, y el cliente no siente que entró
// a otro programa.
import { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { makeStyles } from 'tss-react/mui';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Typography,
  Alert,
  LinearProgress,
  Stack,
  Button,
  Menu,
  MenuItem,
} from '@mui/material';
import MapView from '../map/core/MapView';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import MapMarkers from '../map/MapMarkers';
import MapCamera from '../map/MapCamera';
import MapScale from '../map/MapScale';
import { useEffectAsync } from '../reactHelper';
import rutasApi from './api';
import { exportarExcel, exportarCsv, exportarKml } from './exportar';

// Cómo se supo que llegó, dicho para el encargado.
const LLEGADA_POR = {
  motor_apagado: 'apagó el motor',
  estacionado: 'se estacionó',
  conductor: 'lo marcó el conductor',
};

const useStyles = makeStyles()(() => ({
  contenedor: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 },
  mapa: { flexBasis: '40%', flexShrink: 0, position: 'relative', minHeight: 240 },
  detalle: { flexGrow: 1, minHeight: 0, overflow: 'auto' },
}));

// Fuera del componente: llamar a new Date() dentro del render rompe la pureza que exige
// React 19, y el linter lo marca. Acá es una función pura sobre su argumento.
const fechaLarga = (f) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

const ETIQUETA = {
  pendiente: { texto: 'Pendiente', color: 'default' },
  en_sitio: { texto: 'En el punto', color: 'info' },
  // El GPS lo vio entrar y salir, pero el conductor no dijo qué pasó. No es lo mismo que una
  // entrega confirmada y el reporte no puede tratarlos igual.
  visitada: { texto: 'Llegó, sin confirmar', color: 'warning' },
  entregado: { texto: 'Entregado', color: 'success' },
  no_entregado: { texto: 'No se pudo', color: 'warning' },
};

const JornadaMapa = ({ jornadaId }) => {
  const { classes } = useStyles();
  const theme = useTheme();

  const [cumplimiento, setCumplimiento] = useState(null);
  const [coordenadas, setCoordenadas] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [jornada, setJornada] = useState(null);
  const [menuExportar, setMenuExportar] = useState(null);

  useEffectAsync(async () => {
    setCargando(true);
    try {
      // El trazo puede fallar por su cuenta —motor de ruteo caído— sin que eso impida ver
      // el cumplimiento, que es el dato importante. Por eso van por separado.
      const [datos, ficha] = await Promise.all([
        rutasApi.cumplimiento(jornadaId),
        rutasApi.jornada(jornadaId),
      ]);
      setCumplimiento(datos);
      setJornada(ficha);
      try {
        const trazo = await rutasApi.trazo(jornadaId);
        setCoordenadas(trazo.coordenadas.map((c) => [c.longitud, c.latitud]));
      } catch {
        /* sin trazo el mapa muestra solo las paradas */
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [jornadaId]);

  const marcadores = (cumplimiento?.paradas ?? [])
    .filter((p) => p.punto.latitud != null)
    .map((p) => ({ latitude: p.punto.latitud, longitude: p.punto.longitud }));

  return (
    <div className={classes.contenedor}>
      <div className={classes.mapa}>
        <MapView>
          <MapRouteCoordinates name="Ruta planificada" coordinates={coordenadas} />
          <MapMarkers markers={marcadores} />
        </MapView>
        <MapScale />
        <MapCamera
          coordinates={
            coordenadas.length ? coordenadas : marcadores.map((m) => [m.longitude, m.latitude])
          }
        />
      </div>

      <div className={classes.detalle}>
        {cargando && <LinearProgress />}
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {cumplimiento && (
          <>
            <Stack
              direction="row"
              spacing={2}
              sx={{ p: 2, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <Chip
                size="small"
                label={cumplimiento.situacion?.texto ?? cumplimiento.estado}
                color={cumplimiento.situacion?.clave === 'finalizada' ? 'success' : 'primary'}
              />
              <Typography variant="body2">
                <strong>{cumplimiento.cumplidas}</strong> de {cumplimiento.total} paradas
              </Typography>
              {jornada && (
                <Typography variant="body2" color="text.secondary">
                  {fechaLarga(jornada.fecha)}
                </Typography>
              )}
              {cumplimiento.sinConfirmar > 0 && (
                <Typography variant="body2" color="warning.main">
                  {cumplimiento.sinConfirmar} sin confirmar por el conductor
                </Typography>
              )}
              <Typography
                variant="body2"
                color={cumplimiento.conAtraso ? 'warning.main' : 'text.secondary'}
              >
                {cumplimiento.conAtraso} con atraso
                {cumplimiento.atrasoMaximoMinutos > 0 &&
                  ` · máximo ${cumplimiento.atrasoMaximoMinutos} min`}
              </Typography>
              <Button size="small" onClick={(e) => setMenuExportar(e.currentTarget)}>
                Exportar
              </Button>
              <Menu
                anchorEl={menuExportar}
                open={Boolean(menuExportar)}
                onClose={() => setMenuExportar(null)}
              >
                <MenuItem
                  onClick={() => {
                    exportarExcel(jornada, cumplimiento, theme);
                    setMenuExportar(null);
                  }}
                >
                  Detalle de la jornada (Excel)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    exportarCsv(jornada, cumplimiento);
                    setMenuExportar(null);
                  }}
                >
                  Paradas y tiempos (CSV)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    exportarKml(jornada, cumplimiento, coordenadas);
                    setMenuExportar(null);
                  }}
                >
                  Recorrido para Google Earth (KML)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuExportar(null);
                    window.print();
                  }}
                >
                  Comprobante para el cliente (imprimir)
                </MenuItem>
              </Menu>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Punto</TableCell>
                  <TableCell align="right">Debía llegar</TableCell>
                  <TableCell align="right">Llegó</TableCell>
                  <TableCell align="right">Salió</TableCell>
                  <TableCell align="right">Estuvo</TableCell>
                  <TableCell>Confirmó</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cumplimiento.paradas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.orden}</TableCell>
                    <TableCell>{p.punto.nombre}</TableCell>
                    <TableCell align="right">{hora(p.horaEstimada)}</TableCell>
                    <TableCell align="right">
                      {hora(p.horaLlegada)}
                      {/* Qué confirmó la llegada. Si alguna vez una hora parece rara, acá se
                          ve de dónde salió. */}
                      {p.llegadaPor && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {LLEGADA_POR[p.llegadaPor] ?? p.llegadaPor}
                        </Typography>
                      )}
                      {p.minutosAtraso != null && (
                        <Typography
                          variant="caption"
                          display="block"
                          color={p.minutosAtraso > 0 ? 'warning.main' : 'success.main'}
                        >
                          {p.minutosAtraso > 0
                            ? `${p.minutosAtraso} min tarde`
                            : `${Math.abs(p.minutosAtraso)} min antes`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{hora(p.horaSalida)}</TableCell>
                    <TableCell align="right">
                      {p.minutosEnSitio != null ? `${p.minutosEnSitio} min` : '—'}
                    </TableCell>
                    <TableCell>
                      {/* Lo que el GPS vio va en «Llegó»; esto es lo que dijo la persona. Un
                          reporte que mezcle las dos cosas no sirve para reclamar nada. */}
                      {p.confirmada ? (
                        <Typography variant="caption">Sí · {hora(p.confirmadaEn)}</Typography>
                      ) : (
                        <Typography
                          variant="caption"
                          color={p.sinConfirmar ? 'warning.main' : 'text.secondary'}
                        >
                          {p.sinConfirmar ? 'No confirmó' : '—'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={(ETIQUETA[p.estado] ?? { texto: p.estado }).texto}
                        color={(ETIQUETA[p.estado] ?? {}).color ?? 'default'}
                      />
                      {/* El motivo al lado del estado: «No se pudo» sin explicación obliga a
                          llamar al conductor, que es lo que este módulo viene a evitar. */}
                      {p.motivo && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {p.motivo}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
};

export default JornadaMapa;
