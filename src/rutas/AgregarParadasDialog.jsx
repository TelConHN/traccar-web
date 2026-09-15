// Agregar paradas a una ruta que ya va en camino.
//
// El caso es el de siempre en un reparto: el camión salió a las ocho, son las once, y entra
// un pedido. Lo que esta pantalla tiene que dejar claro antes de tocar nada es **qué le va a
// pasar al conductor**: desde dónde se recalcula, si tiene que volver a la bodega a cargar, y
// a qué hora termina ahora.
//
// Por eso hay dos pasos: primero se ve el plan que propone el sistema —con las dos maneras de
// hacerlo y cuál sale mejor— y recién después se manda. Cambiar la ruta de alguien que está
// manejando no es algo que deba pasar de un clic sin ver las consecuencias.
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Alert,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  FormControlLabel,
  Switch,
  LinearProgress,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import rutasApi from './api';

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—';

const duracion = (min) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

const AgregarParadasDialog = ({ open, jornada, puntos, onClose, onAplicado }) => {
  const [elegidos, setElegidos] = useState([]);
  const [recargaEnBase, setRecargaEnBase] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [plan, setPlan] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  // El interruptor arranca según lo que se eligió al planificar: una ruta de paquetes recarga
  // en la bodega, una de recorrido no. Se puede forzar —a veces el camión salió cargado para
  // el día entero— pero el valor por defecto ya no se adivina acá.
  useEffect(() => {
    if (open) {
      setElegidos([]);
      setPlan(null);
      setError('');
      setBusqueda('');
      setRecargaEnBase(jornada?.tipo !== 'recorrido');
    }
  }, [open, jornada]);

  // Los puntos que ya están en la ruta no se ofrecen: agregarlos otra vez lo rechaza el
  // servidor, y ofrecer algo que va a fallar es peor que no ofrecerlo.
  const yaEnRuta = new Set((jornada?.paradas ?? []).map((p) => p.punto.id));
  const disponibles = puntos.filter(
    (p) => !yaEnRuta.has(p.id) && p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  const calcular = async () => {
    setCalculando(true);
    setError('');
    try {
      setPlan(
        await rutasApi.paradasExtra(jornada.id, {
          puntoIds: elegidos,
          recargaEnBase,
          aplicar: false,
        }),
      );
    } catch (e) {
      setPlan(null);
      setError(e.message);
    } finally {
      setCalculando(false);
    }
  };

  const aplicar = async () => {
    setOcupado(true);
    try {
      await rutasApi.paradasExtra(jornada.id, { puntoIds: elegidos, recargaEnBase, aplicar: true });
      onClose();
      await onAplicado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open={open} onClose={ocupado ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Agregar paradas a una ruta en camino</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            Se recalcula desde donde está el vehículo ahora, respetando lo que ya entregó.
          </Typography>

          <TextField
            size="small"
            fullWidth
            placeholder="Buscar un punto de la libreta"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
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

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {disponibles.map((p) => (
              <Chip
                key={p.id}
                label={p.nombre}
                color={elegidos.includes(p.id) ? 'primary' : 'default'}
                variant={elegidos.includes(p.id) ? 'filled' : 'outlined'}
                onClick={() => {
                  setElegidos((s) =>
                    s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id],
                  );
                  setPlan(null);
                }}
              />
            ))}
            {disponibles.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                No hay más puntos en la libreta. Agregalos desde «Planificar».
              </Typography>
            )}
          </Stack>

          {/* La regla que ningún mapa conoce: no se puede entregar lo que no se lleva. */}
          <FormControlLabel
            control={
              <Switch
                checked={recargaEnBase}
                onChange={(e) => {
                  setRecargaEnBase(e.target.checked);
                  setPlan(null);
                }}
              />
            }
            label="Tiene que pasar por la bodega a cargar"
          />
          {jornada?.tipo && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>
              Esta ruta se planificó como{' '}
              {jornada.tipo === 'recorrido' ? 'recorrido' : 'entrega de paquetes'}.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            {recargaEnBase
              ? 'Son paquetes: las paradas nuevas van después de pasar a recogerlos. El sistema mide si conviene volver ya o terminar primero lo que lleva.'
              : 'Sin carga de por medio: se reordena todo lo que falta desde donde está.'}
          </Typography>

          {calculando && <LinearProgress />}

          {plan && (
            <>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="overline" color="text.secondary">
                  Cómo conviene hacerlo
                </Typography>
                <Stack spacing={1} sx={{ mt: 0.5 }}>
                  {plan.opciones.map((o) => (
                    <Stack
                      key={o.clave}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography
                        variant="body2"
                        fontWeight={o.clave === plan.elegida ? 600 : 400}
                        color={o.clave === plan.elegida ? 'text.primary' : 'text.secondary'}
                      >
                        {o.clave === plan.elegida ? '✓ ' : ''}
                        {o.texto}
                      </Typography>
                      <Typography
                        variant="caption"
                        color={o.clave === plan.elegida ? 'success.main' : 'text.secondary'}
                      >
                        {o.km} km · {duracion(o.minutos)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: 'block' }}
                >
                  Última señal del vehículo {hora(plan.posicion.cuando)} · {plan.yaHechas} paradas
                  ya resueltas, que no se tocan · termina {hora(plan.termina)}
                </Typography>
              </Paper>

              <Paper variant="outlined">
                <List dense disablePadding>
                  {plan.paradas.map((p, i) => (
                    <ListItem key={`${p.nombre}-${i}`} divider={i < plan.paradas.length - 1}>
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar sx={{ width: 26, height: 26, fontSize: '0.75rem' }}>{i + 1}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <>
                            {p.nombre}
                            {p.esBase && (
                              <Chip
                                size="small"
                                label="cargar"
                                color="warning"
                                variant="outlined"
                                sx={{ ml: 1, height: 18, fontSize: '0.62rem' }}
                              />
                            )}
                            {p.esNueva && (
                              <Chip
                                size="small"
                                label="nueva"
                                color="primary"
                                sx={{ ml: 1, height: 18, fontSize: '0.62rem' }}
                              />
                            )}
                          </>
                        }
                        secondary={`Llega ${hora(p.horaEstimada)}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Alert severity="info">
                Al mandarla, al conductor se le actualiza la ruta en su teléfono y Traccar pasa a
                vigilar el recorrido nuevo. Conviene avisarle por teléfono si tiene que volver a
                cargar.
              </Alert>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={ocupado}>
          Cancelar
        </Button>
        <Button onClick={calcular} disabled={calculando || ocupado || elegidos.length === 0}>
          {plan ? 'Recalcular' : 'Calcular ruta'}
        </Button>
        <Button variant="contained" onClick={aplicar} disabled={!plan || ocupado}>
          Mandársela al conductor
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgregarParadasDialog;
