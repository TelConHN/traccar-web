// La campana de Rutas: lo que pasó, y qué llega por correo.
//
// Dos pestañas porque son dos preguntas distintas: «¿qué me perdí?» se contesta mirando la
// lista; «¿por qué me llegan tantos correos?» —o ninguno— se contesta en la otra, sin tener que
// pedirle a nadie de TelConHN que lo cambie.
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Stack,
  Chip,
  Paper,
  TextField,
  MenuItem,
  Alert,
  LinearProgress,
  Divider,
} from '@mui/material';
import rutasApi from './api';
import { useEffectAsync } from '../reactHelper';

// Cómo se nombra cada canal para quien elige. «Plataforma» a secas no dice nada; «solo acá»
// dice exactamente qué pasa.
const CANAL = {
  inmediato: 'Correo al momento',
  resumen: 'En el resumen del día',
  plataforma: 'Solo acá, sin correo',
  nada: 'No avisarme',
};

const COLOR_GRUPO = {
  ruta: 'primary',
  planificacion: 'secondary',
  usuarios: 'default',
  conductor: 'default',
};

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
const dia = (iso) =>
  new Date(iso).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' });

// Agrupados por día: con cuarenta avisos, saber dónde empieza ayer es la mitad de la lectura.
const porDia = (items) => {
  const mapa = new Map();
  items.forEach((n) => {
    const d = dia(n.creadaEn);
    if (!mapa.has(d)) mapa.set(d, []);
    mapa.get(d).push(n);
  });
  return [...mapa.entries()];
};

const Avisos = ({ onLeidas }) => {
  const navigate = useNavigate();
  const [pestana, setPestana] = useState(0);
  const [avisos, setAvisos] = useState({ items: [], noLeidas: 0 });
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setAvisos(await rutasApi.notificaciones({ limite: 100 }));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffectAsync(cargar, []);

  // Llegan avisos mientras la pantalla está abierta: se vuelve a mirar cada minuto.
  useEffect(() => {
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffectAsync(async () => {
    if (pestana !== 1 || prefs) return;
    try {
      setPrefs(await rutasApi.preferencias());
    } catch (e) {
      setError(e.message);
    }
  }, [pestana, prefs]);

  const marcar = async (ids) => {
    try {
      await rutasApi.marcarLeidas(ids);
      await cargar();
      onLeidas?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const abrir = async (n) => {
    if (!n.leida) await marcar([n.id]);
    if (n.jornadaId) navigate(`/rutas/${n.jornadaId}`);
    else if (n.viajeId) navigate(`/transporte/viajes/${n.viajeId}`);
  };

  const cambiarCanal = async (tipo, canal) => {
    // Se muestra el cambio al instante; si el servidor lo rechaza, se vuelve atrás.
    const antes = prefs;
    setPrefs({ ...prefs, tipos: prefs.tipos.map((t) => (t.tipo === tipo ? { ...t, canal } : t)) });
    try {
      await rutasApi.guardarPreferencia(tipo, canal);
    } catch (e) {
      setPrefs(antes);
      setError(e.message);
    }
  };

  return (
    <Stack sx={{ p: 2, maxWidth: 900 }} spacing={2}>
      <Tabs value={pestana} onChange={(_e, v) => setPestana(v)}>
        <Tab label={avisos.noLeidas ? `Avisos (${avisos.noLeidas})` : 'Avisos'} />
        <Tab label="Qué me llega por correo" />
      </Tabs>

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {pestana === 0 && (
        <>
          {cargando && <LinearProgress />}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Todo lo que pasa en tus rutas queda acá, llegue o no por correo.
            </Typography>
            {avisos.noLeidas > 0 && (
              <Button size="small" onClick={() => marcar()}>
                Marcar todo como leído
              </Button>
            )}
          </Stack>

          {avisos.items.length === 0 && !cargando && (
            <Typography variant="body2" color="text.secondary">
              Todavía no hay avisos. Aparecen cuando se crea o se despacha una ruta, cuando un
              vehículo llega a una parada, o cuando algo necesita tu atención.
            </Typography>
          )}

          {porDia(avisos.items).map(([d, lista]) => (
            <Paper key={d} variant="outlined">
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ px: 2, py: 1, display: 'block', textTransform: 'capitalize' }}
              >
                {d}
              </Typography>
              <Divider />
              <List dense disablePadding>
                {lista.map((n) => (
                  <ListItemButton
                    key={n.id}
                    onClick={() => abrir(n)}
                    sx={{
                      alignItems: 'flex-start',
                      ...(n.leida ? {} : { bgcolor: 'action.hover' }),
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ width: 64, flexShrink: 0, pt: 0.5 }}
                    >
                      {hora(n.creadaEn)}
                    </Typography>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={n.leida ? 400 : 600}>
                          {n.titulo}
                        </Typography>
                      }
                      secondary={n.detalle}
                    />
                    <Stack alignItems="flex-end" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                      {/* Si salió por correo o va en el resumen: responde «¿me llegó esto?». */}
                      {n.correoEstado === 'enviado' && (
                        <Chip size="small" label="Enviado por correo" variant="outlined" />
                      )}
                      {n.correoEstado === 'en_resumen' && (
                        <Chip size="small" label="Va en el resumen" variant="outlined" />
                      )}
                      {n.correoEstado === 'pendiente' && (
                        <Chip size="small" label="Enviando" variant="outlined" color="info" />
                      )}
                      {n.correoEstado === 'fallido' && (
                        <Chip
                          size="small"
                          label="El correo falló"
                          variant="outlined"
                          color="warning"
                        />
                      )}
                      <Chip
                        size="small"
                        label={
                          {
                            ruta: 'Ruta',
                            planificacion: 'Planificación',
                            usuarios: 'Usuarios',
                            conductor: 'Conductor',
                          }[n.grupo]
                        }
                        color={COLOR_GRUPO[n.grupo]}
                        sx={{ height: 18, fontSize: '0.62rem' }}
                      />
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          ))}
        </>
      )}

      {pestana === 1 && (
        <>
          <Typography variant="body2" color="text.secondary">
            Todo aparece siempre acá. Esto decide solo qué además te llega por correo. Lo urgente
            —una entrega que no se pudo, un desvío— conviene al momento; lo demás, en un solo correo
            al final del día.
          </Typography>
          {!prefs && <LinearProgress />}
          {prefs &&
            Object.entries(prefs.grupos)
              .filter(([g]) => prefs.tipos.some((t) => t.grupo === g))
              .map(([g, nombre]) => (
                <Paper key={g} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {nombre}
                  </Typography>
                  <Stack spacing={1.5}>
                    {prefs.tipos
                      .filter((t) => t.grupo === g)
                      .map((t) => (
                        <Stack
                          key={t.tipo}
                          direction={{ xs: 'column', sm: 'row' }}
                          justifyContent="space-between"
                          alignItems={{ xs: 'stretch', sm: 'center' }}
                          spacing={1}
                        >
                          <Typography variant="body2">{t.nombre}</Typography>
                          <TextField
                            select
                            size="small"
                            value={t.canal}
                            onChange={(e) => cambiarCanal(t.tipo, e.target.value)}
                            sx={{ minWidth: 240 }}
                          >
                            {prefs.canales.map((c) => (
                              <MenuItem key={c} value={c}>
                                {CANAL[c]}
                                {c === t.porDefecto ? ' (recomendado)' : ''}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Stack>
                      ))}
                  </Stack>
                </Paper>
              ))}
        </>
      )}
    </Stack>
  );
};

export default Avisos;
