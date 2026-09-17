// Horarios: qué bus y qué conductor hacen cada recorrido, qué días y a qué hora.
//
// Antes de guardar se dibuja el día del bus (DiaDelVehiculo, el mismo de Rutas) con lo que ya
// tiene —turnos de Transporte y rutas de reparto— y el turno nuevo encima: un choque se ve en
// un segundo, dos bloques encimados, en vez de leer dos horas y compararlas en la cabeza. El
// servidor lo rechaza igual (409) por si acaso.
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffectAsync } from '../reactHelper';
import DiaDelVehiculo from '../rutas/DiaDelVehiculo';
import rutasApi from '../rutas/api';
import transporteApi from './api';

const DIAS = [
  [1, 'L'],
  [2, 'M'],
  [3, 'X'],
  [4, 'J'],
  [5, 'V'],
  [6, 'S'],
  [7, 'D'],
];
const NOMBRE_DIA = { 1: 'lun', 2: 'mar', 3: 'mié', 4: 'jue', 5: 'vie', 6: 'sáb', 7: 'dom' };

const hoy = () => new Date().toLocaleDateString('en-CA');

const VACIO = {
  varianteId: '',
  traccarDeviceId: '',
  conductorUserId: '',
  diasSemana: [1, 2, 3, 4, 5],
  horaInicio: '06:00',
  horaFin: '07:30',
  vigenteDesde: hoy(),
  vigenteHasta: '',
  grupoIds: [],
};

/// Los días como se leen: «lun–vie», «lun, mié, vie», «todos los días».
const diasTexto = (dias) => {
  const d = [...dias].sort();
  if (d.length === 7) return 'todos los días';
  if (d.length === 5 && d.join() === '1,2,3,4,5') return 'lun–vie';
  return d.map((x) => NOMBRE_DIA[x]).join(', ');
};

const Turnos = ({ perfil }) => {
  const [turnos, setTurnos] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [error, setError] = useState('');
  const [dialogo, setDialogo] = useState(null); // { id?, ...campos }
  const [guardando, setGuardando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [dia, setDia] = useState({ turnos: [], jornadas: [] });
  const [fechaVista, setFechaVista] = useState(hoy());

  const cargar = async () => {
    try {
      const [t, l] = await Promise.all([transporteApi.turnos(), transporteApi.lineas()]);
      setTurnos(t);
      setLineas(l);
      // Los grupos solo existen con pasajeros registrados; en una ruta pública la lista queda vacía.
      setGrupos(await transporteApi.grupos().catch(() => []));
      setError('');
    } catch (e) {
      setError(e.message);
    }
    // Los conductores son los de Rutas: misma cuenta, misma gente. Si la sesión no puede
    // verlos (un conductor), la lista queda vacía y el campo se oculta.
    try {
      const p = await rutasApi.perfil();
      setConductores(p.conductores ?? []);
    } catch {
      setConductores([]);
    }
  };
  useEffectAsync(cargar, [perfil?.clienteElegido?.id]);

  // El día del bus para la vista previa: se pide al cambiar de bus o de fecha.
  useEffect(() => {
    if (!dialogo?.traccarDeviceId) return;
    let vivo = true;
    transporteApi
      .diaDelBus(dialogo.traccarDeviceId, fechaVista)
      .then((r) => vivo && setDia(r))
      .catch(() => vivo && setDia({ turnos: [], jornadas: [] }));
    return () => {
      vivo = false;
    };
  }, [dialogo?.traccarDeviceId, fechaVista]);

  const variantes = lineas.flatMap((l) =>
    l.variantes.map((v) => ({ id: v.id, nombre: `${l.nombre} · ${v.nombre}`, metros: v.metros })),
  );

  const abrirNuevo = () =>
    setDialogo({
      ...VACIO,
      varianteId: variantes[0]?.id ?? '',
      traccarDeviceId: perfil.vehiculos[0]?.id ?? '',
    });
  const abrirEditar = (t) =>
    setDialogo({
      id: t.id,
      varianteId: t.varianteId,
      traccarDeviceId: t.traccarDeviceId,
      conductorUserId: t.conductorUserId ?? '',
      diasSemana: t.diasSemana,
      horaInicio: t.horaInicio,
      horaFin: t.horaFin,
      vigenteDesde: String(t.vigenteDesde).slice(0, 10),
      vigenteHasta: t.vigenteHasta ? String(t.vigenteHasta).slice(0, 10) : '',
      grupoIds: t.grupoIds ?? [],
    });

  const guardar = async () => {
    setGuardando(true);
    setErrorDialogo('');
    const datos = {
      varianteId: dialogo.varianteId,
      traccarDeviceId: Number(dialogo.traccarDeviceId),
      conductorUserId: dialogo.conductorUserId ? Number(dialogo.conductorUserId) : null,
      diasSemana: dialogo.diasSemana,
      horaInicio: dialogo.horaInicio,
      horaFin: dialogo.horaFin,
      vigenteDesde: dialogo.vigenteDesde,
      vigenteHasta: dialogo.vigenteHasta || null,
      grupoIds: dialogo.grupoIds ?? [],
    };
    try {
      if (dialogo.id) await transporteApi.editarTurno(dialogo.id, datos);
      else await transporteApi.crearTurno(datos);
      setDialogo(null);
      await cargar();
    } catch (e) {
      setErrorDialogo(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (t) => {
    try {
      await transporteApi.borrarTurno(t.id);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const puedeEditar = perfil.configura;
  const nombreBus = (id) => perfil.vehiculos.find((v) => v.id === id)?.nombre ?? `Bus ${id}`;
  const nombreConductor = (id) => conductores.find((c) => c.id === id)?.nombre ?? null;

  // La vista previa del día: los bloques que ya tiene el bus (sin el que se está editando) y el
  // nuevo encima.
  const salidaEn = (f, hhmm) => new Date(`${f}T${hhmm}:00`);
  const finDeNuevo = () => {
    const s = salidaEn(fechaVista, dialogo.horaInicio);
    let f = salidaEn(fechaVista, dialogo.horaFin);
    if (f <= s) f = new Date(f.getTime() + 24 * 60 * 60 * 1000);
    return f;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2 }}
      >
        <div>
          <Typography variant="h5" component="h1" fontWeight={600}>
            Horarios
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Qué bus y qué conductor hacen cada recorrido y a qué hora. Desde ese momento, si se sale
            del camino o pasa una parada de largo, te avisamos.
          </Typography>
        </div>
        {puedeEditar && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={abrirNuevo}
            disabled={variantes.length === 0}
          >
            Nuevo horario
          </Button>
        )}
      </Stack>

      {!turnos && !error && <LinearProgress />}
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {turnos && variantes.length === 0 && (
        <Alert severity="info">
          Primero grabá un recorrido: un horario es un recorrido con bus, conductor y hora.
        </Alert>
      )}
      {turnos && turnos.length === 0 && variantes.length > 0 && (
        <Alert severity="info">Todavía no hay horarios. Creá el primero con «Nuevo horario».</Alert>
      )}

      {turnos && turnos.length > 0 && (
        <List disablePadding component={Paper} variant="outlined">
          {turnos.map((t, i) => (
            <ListItem
              key={t.id}
              divider={i < turnos.length - 1}
              secondaryAction={
                puedeEditar && (
                  <Stack direction="row">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => abrirEditar(t)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Quitar">
                      <IconButton size="small" onClick={() => borrar(t)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )
              }
            >
              <ListItemText
                primary={`${t.horaInicio}–${t.horaFin} · ${t.variante.linea.nombre} · ${t.variante.nombre}`}
                secondary={
                  <Stack
                    direction="row"
                    spacing={0.75}
                    useFlexGap
                    flexWrap="wrap"
                    component="span"
                    sx={{ mt: 0.5 }}
                  >
                    <Chip size="small" label={t.vehiculo} />
                    {t.conductorUserId && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={nombreConductor(t.conductorUserId) ?? 'Conductor'}
                      />
                    )}
                    <Chip size="small" variant="outlined" label={diasTexto(t.diasSemana)} />
                    {t.vigenteHasta && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`hasta ${String(t.vigenteHasta).slice(0, 10)}`}
                      />
                    )}
                  </Stack>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={Boolean(dialogo)} onClose={() => setDialogo(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dialogo?.id ? 'Editar horario' : 'Nuevo horario'}</DialogTitle>
        <DialogContent>
          {dialogo && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                select
                size="small"
                label="Recorrido"
                value={dialogo.varianteId}
                onChange={(e) => setDialogo({ ...dialogo, varianteId: e.target.value })}
              >
                {variantes.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.nombre} · {(v.metros / 1000).toFixed(1)} km
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Bus"
                  value={dialogo.traccarDeviceId}
                  onChange={(e) => setDialogo({ ...dialogo, traccarDeviceId: e.target.value })}
                >
                  {perfil.vehiculos.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.nombre}
                    </MenuItem>
                  ))}
                </TextField>
                {conductores.length > 0 && (
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Conductor (opcional)"
                    value={dialogo.conductorUserId}
                    onChange={(e) => setDialogo({ ...dialogo, conductorUserId: e.target.value })}
                  >
                    <MenuItem value="">Sin asignar</MenuItem>
                    {conductores
                      .filter((c) => c.rol !== 'encargado')
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.nombre}
                        </MenuItem>
                      ))}
                  </TextField>
                )}
              </Stack>
              <div>
                <Typography variant="caption" color="text.secondary">
                  Días
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  value={dialogo.diasSemana}
                  onChange={(_, v) => v.length > 0 && setDialogo({ ...dialogo, diasSemana: v })}
                  sx={{ display: 'flex', mt: 0.5 }}
                >
                  {DIAS.map(([n, letra]) => (
                    <ToggleButton key={n} value={n} sx={{ flex: 1, minWidth: 0 }}>
                      {letra}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              <Stack direction="row" spacing={2}>
                <TextField
                  type="time"
                  fullWidth
                  size="small"
                  label="Sale"
                  value={dialogo.horaInicio}
                  onChange={(e) => setDialogo({ ...dialogo, horaInicio: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="time"
                  fullWidth
                  size="small"
                  label="Termina"
                  value={dialogo.horaFin}
                  onChange={(e) => setDialogo({ ...dialogo, horaFin: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  type="date"
                  fullWidth
                  size="small"
                  label="Vigente desde"
                  value={dialogo.vigenteDesde}
                  onChange={(e) => setDialogo({ ...dialogo, vigenteDesde: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="date"
                  fullWidth
                  size="small"
                  label="Hasta (opcional)"
                  value={dialogo.vigenteHasta}
                  onChange={(e) => setDialogo({ ...dialogo, vigenteHasta: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>

              {grupos.length > 0 && (
                <TextField
                  select
                  size="small"
                  label="Grupos que atiende (para enlaces de grupo)"
                  value={dialogo.grupoIds ?? []}
                  onChange={(e) => setDialogo({ ...dialogo, grupoIds: e.target.value })}
                  slotProps={{ select: { multiple: true } }}
                >
                  {grupos.map((g) => (
                    <MenuItem key={g.id} value={g.id}>
                      {g.nombre}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Lo que ya tiene el bus ese día
                  </Typography>
                  <TextField
                    type="date"
                    size="small"
                    value={fechaVista}
                    onChange={(e) => setFechaVista(e.target.value)}
                    sx={{ width: 160 }}
                  />
                </Stack>
                <DiaDelVehiculo
                  titulo={`Día del ${nombreBus(Number(dialogo.traccarDeviceId))}`}
                  rutas={[...dia.turnos, ...dia.jornadas]
                    .filter((b) => b.id !== dialogo.id && b.salida && b.fin)
                    .map((b) => ({ id: b.id, nombre: b.nombre, salida: b.salida, fin: b.fin }))}
                  nueva={{ salida: salidaEn(fechaVista, dialogo.horaInicio), fin: finDeNuevo() }}
                />
              </Paper>
              {errorDialogo && <Alert severity="error">{errorDialogo}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogo(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={guardando || !dialogo?.varianteId || !dialogo?.traccarDeviceId}
            onClick={guardar}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Turnos;
