import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import { prefixString } from '../common/util/stringUtils';
import { formatTime } from '../common/util/formatter';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import { useAsyncTask, useCatch, useEffectAsync } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Cuánto se queda la página mirando si los equipos contestan. Lo que llegue después queda igual en
// Reportes → Auditoría.
const WAIT_OPTIONS = [
  { value: 0, label: 'No esperar' },
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
  { value: 120, label: '2 minutos' },
  { value: 300, label: '5 minutos' },
  { value: 600, label: '10 minutos' },
];
// Cada consulta busca la respuesta de cada vehículo pendiente en los eventos: con cientos de vehículos,
// cada 5 s cargaba la base de datos.
const POLL_INTERVAL = 15000;

// Cortar o devolver el motor: se pide confirmar a propósito y, por defecto, no se deja en cola (entregado
// después, con el carro andando, corta el motor en marcha). Los personalizados se reconocen por el nombre.
const ENGINE_TYPES = ['engineStop', 'engineResume'];
const isEngineCommand = (command) =>
  !!command &&
  (ENGINE_TYPES.includes(command.type) ||
    /motor|bloque|corte|apag/i.test(command.description || ''));
const isEngineStop = (command) =>
  command?.type === 'engineStop' ||
  (command?.type !== 'engineResume' &&
    /bloque|corte|apag/i.test(command?.description || '') &&
    !/desbloque/i.test(command?.description || ''));

// Tipo de GPS = el protocolo con que el equipo reporta, que es lo que decide qué comandos entiende. El
// modelo es texto libre de la instalación («ST-906L», «ST906-L», a veces el nombre del carro): se muestra
// como detalle, pero agrupar por él partía una misma marca en varios tipos.
const PROTOCOL_NAMES = {
  h02: 'Sinotrack',
  startek: 'iStartek',
  teltonika: 'Teltonika',
  gt06: 'Concox / Micodus',
  tk103: 'Coban / TK103',
  osmand: 'App de rastreo / simulados',
};
const NO_PROTOCOL = '';
const typeKey = (row) => row.protocol || NO_PROTOCOL;
const typeLabel = (protocol) => {
  if (!protocol) {
    return 'Sin reportar todavía';
  }
  return PROTOCOL_NAMES[protocol] || protocol;
};

const reasonText = (row) => {
  switch (row.reason) {
    case 'unsupported':
      return `Su GPS (${typeLabel(row.protocol)}) no admite este comando`;
    case 'noPosition':
      return 'Nunca ha reportado y el comando va por SMS';
    case 'disabled':
      return 'Vehículo desactivado';
    case 'demo':
      return 'Vehículo simulado: no tiene GPS';
    case 'noPhone':
      return 'No tiene número de SIM para mandarle SMS';
    case 'recent':
      return `Ya se le mandó este comando hace un momento${row.cooldown ? ` (podrás en ${row.cooldown} s)` : ''}`;
    case 'alreadyQueued':
      return 'Ya tiene este comando esperando a que se conecte';
    case 'offline':
      return 'Estaba desconectado: no se dejó en cola';
    case 'notFound':
      return 'Ya no existe';
    default:
      return row.reason || '';
  }
};

const newKey = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const formatCountdown = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// Ajustes → Comandos masivos: elegir un comando guardado, marcar los vehículos y enviar.
const BulkCommandsPage = () => {
  const t = useTranslation();
  const admin = useAdministrator();

  const [commands, setCommands] = useState([]);
  const [commandId, setCommandId] = useState('');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [reloadRows, setReloadRows] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showBlocked, setShowBlocked] = useState(false);

  const [confirm, setConfirm] = useState(null);
  const [wait, setWait] = useState(60);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [batch, setBatch] = useState(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const sendingRef = useRef(false);

  const command = commands.find((item) => item.id === commandId);

  useEffectAsync(async () => {
    if (admin) {
      const response = await fetchOrThrow('api/commands?all=true');
      setCommands(await response.json());
    }
  }, [admin]);

  // Con signal: si se cambia de comando mientras carga, la lista del comando anterior se descarta y no
  // pisa a la del nuevo.
  useAsyncTask(
    async ({ signal }) => {
      void reloadRows;
      if (!commandId) {
        setRows([]);
        return;
      }
      setLoadingRows(true);
      try {
        const response = await fetchOrThrow(`api/commands/bulk/devices?commandId=${commandId}`, {
          signal,
        });
        const data = await response.json();
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setRows(data);
        // Lo marcado que dejó de poder recibirlo (otro comando, o se le acaba de mandar) se desmarca.
        const usable = new Set(data.filter((row) => !row.reason).map((row) => row.id));
        setSelectedIds((prev) => new Set([...prev].filter((id) => usable.has(id))));
      } finally {
        setLoadingRows(false);
      }
    },
    [commandId, reloadRows],
  );

  // Cuando se cumple la espera de 30 s de algún vehículo, se vuelve a preguntar para habilitarlo.
  useEffect(() => {
    const cooldowns = rows.filter((row) => row.cooldown > 0).map((row) => row.cooldown);
    if (!cooldowns.length) {
      return undefined;
    }
    const timer = setTimeout(
      () => setReloadRows((k) => k + 1),
      Math.min(...cooldowns) * 1000 + 500,
    );
    return () => clearTimeout(timer);
  }, [rows]);

  // Tipos de GPS presentes, con cuántos vehículos de cada uno pueden recibir el comando.
  const types = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = typeKey(row);
      if (!map.has(key)) {
        map.set(key, { key, label: typeLabel(row.protocol), usable: 0 });
      }
      if (!row.reason) {
        map.get(key).usable += 1;
      }
    });
    return [...map.values()]
      .filter((type) => type.usable > 0)
      .sort((a, b) => b.usable - a.usable || a.label.localeCompare(b.label));
  }, [rows]);

  const matches = useCallback(
    (row) => {
      const keyword = search.trim().toLowerCase();
      return (
        (typeFilter === 'all' || typeKey(row) === typeFilter) &&
        (!keyword ||
          (row.name || '').toLowerCase().includes(keyword) ||
          (row.model || '').toLowerCase().includes(keyword))
      );
    },
    [search, typeFilter],
  );

  const usableRows = useMemo(
    () => rows.filter((row) => !row.reason && matches(row)),
    [rows, matches],
  );
  const blockedRows = useMemo(() => rows.filter((row) => row.reason), [rows]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id) && !row.reason),
    [rows, selectedIds],
  );
  const selectedTypes = useMemo(
    () => [...new Set(selectedRows.map((row) => typeKey(row)))],
    [selectedRows],
  );
  const offlineSelected = selectedRows.filter((row) => row.deviceStatus !== 'online').length;
  const neverReportedSelected = selectedRows.filter((row) => !row.protocol).length;

  const allVisibleSelected =
    usableRows.length > 0 && usableRows.every((row) => selectedIds.has(row.id));
  const someVisibleSelected = usableRows.some((row) => selectedIds.has(row.id));

  const changeCommand = (value) => {
    setCommandId(value);
    setSelectedIds(new Set());
    setTypeFilter('all');
    setShowBlocked(false);
  };

  const toggleDevice = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      usableRows.forEach((row) => (allVisibleSelected ? next.delete(row.id) : next.add(row.id)));
      return next;
    });

  const openConfirm = () => {
    setSendError(null);
    // La clave se arma una vez por confirmación: si la red falla y se reintenta, va la misma y el
    // servidor no lo manda dos veces.
    const engine = isEngineCommand(command);
    setConfirm({ key: newKey(), rows: selectedRows, engine, noQueue: engine, sure: false });
  };

  const handleSend = async () => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const response = await fetch('api/commands/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: confirm.key,
          commandId,
          deviceIds: confirm.rows.map((row) => row.id),
          noQueue: confirm.noQueue,
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || `Error ${response.status}`);
      }
      setBatch(await response.json());
      setWaitUntil(wait > 0 ? Date.now() + wait * 1000 : 0);
      setNow(Date.now());
      setConfirm(null);
      setSelectedIds(new Set());
      setReloadRows((k) => k + 1);
    } catch (error) {
      setSendError(error.message || 'No se pudo conectar con el servidor');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const pendingResponses = batch
    ? batch.entries.filter(
        (entry) => (entry.status === 'sent' || entry.status === 'queued') && entry.result == null,
      ).length
    : 0;
  const waiting = batch && waitUntil > now && pendingResponses > 0;

  const refreshBatch = useCallback(async () => {
    const response = await fetchOrThrow(`api/commands/bulk/${batch.key}`);
    setBatch(await response.json());
  }, [batch?.key]);
  const handleRefresh = useCatch(refreshBatch);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      refreshBatch().catch(() => {});
    }, POLL_INTERVAL);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [waiting, refreshBatch]);

  const entryState = (entry) => {
    switch (entry.status) {
      case 'sent':
        return ['success.main', 'Enviado'];
      case 'queued':
        return entry.deliveredTime
          ? [
              'success.main',
              `Estaba desconectado; se le entregó ${formatTime(entry.deliveredTime, 'time')}`,
            ]
          : ['info.main', 'Desconectado: lo recibirá al conectarse'];
      case 'failed':
        return ['error.main', `No se pudo enviar${entry.error ? `: ${entry.error}` : ''}`];
      default:
        return ['warning.main', `No se envió: ${reasonText(entry)}`];
    }
  };

  const responseText = (entry) => {
    if (entry.result != null) {
      return `Respondió a las ${formatTime(entry.resultTime, 'time')}: ${entry.result || '(sin texto)'}`;
    }
    if (entry.status !== 'sent' && entry.status !== 'queued') {
      return null;
    }
    if (waiting) {
      return 'Esperando respuesta…';
    }
    return waitUntil ? 'No respondió en el tiempo de espera' : null;
  };

  if (!admin) {
    return (
      <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'bulkCommandsTitle']}>
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Alert severity="info">Los comandos masivos son solo para administración.</Alert>
        </Container>
      </PageLayout>
    );
  }

  // Después de enviar: el resultado ocupa la pantalla hasta que se pide un envío nuevo.
  if (batch) {
    const counts = batch.counts || {};
    return (
      <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'bulkCommandsTitle']}>
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">{batch.description}</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Enviado a las {formatTime(batch.created, 'time')}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
              {counts.sent > 0 && <Chip color="success" label={`Enviados: ${counts.sent}`} />}
              {counts.queued > 0 && <Chip color="info" label={`Desconectados: ${counts.queued}`} />}
              {counts.failed > 0 && <Chip color="error" label={`Fallaron: ${counts.failed}`} />}
              {counts.skipped > 0 && (
                <Chip color="warning" label={`No enviados: ${counts.skipped}`} />
              )}
              <Chip variant="outlined" label={`Respondieron: ${batch.responded}`} />
            </Stack>
            {batch.replayed && (
              <Alert severity="info" sx={{ mb: 1 }}>
                Este envío ya se había hecho: no se mandó otra vez, este es su resultado.
              </Alert>
            )}
            {waiting && (
              <Alert
                severity="info"
                icon={<CircularProgress size={20} />}
                sx={{ mb: 1 }}
                action={
                  <Button color="inherit" size="small" onClick={() => setWaitUntil(0)}>
                    Dejar de esperar
                  </Button>
                }
              >
                Esperando respuestas: {formatCountdown(waitUntil - now)}
              </Alert>
            )}
            {!waiting && pendingResponses > 0 && (
              <Alert
                severity="info"
                sx={{ mb: 1 }}
                action={
                  <Button color="inherit" size="small" onClick={handleRefresh}>
                    Revisar otra vez
                  </Button>
                }
              >
                {plural(pendingResponses, 'vehículo no ha', 'vehículos no han')} respondido. Si
                responden después, queda en Informes → Auditoría.
              </Alert>
            )}
            <List disablePadding>
              {batch.entries.map((entry) => {
                const [color, state] = entryState(entry);
                const answer = responseText(entry);
                return (
                  <ListItem key={entry.id} divider disableGutters alignItems="flex-start">
                    <ListItemText
                      primary={entry.name || `Vehículo ${entry.id}`}
                      secondaryTypographyProps={{ component: 'div' }}
                      secondary={
                        <>
                          <Typography variant="body2" color={color}>
                            {state}
                          </Typography>
                          {answer && (
                            <Typography
                              variant="body2"
                              color="text.primary"
                              sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                            >
                              {answer}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
            <Button variant="contained" sx={{ mt: 2 }} onClick={() => setBatch(null)}>
              Hacer otro envío
            </Button>
          </Paper>
        </Container>
      </PageLayout>
    );
  }

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'bulkCommandsTitle']}>
      <Container maxWidth="md" sx={{ py: 2, pb: 12 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            ¿Qué comando quieres enviar?
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Comando guardado</InputLabel>
            <Select
              label="Comando guardado"
              value={commandId}
              onChange={(event) => changeCommand(event.target.value)}
            >
              {commands.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.description || t(prefixString('command', item.type))}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {command?.attributes?.data && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1, wordBreak: 'break-word' }}
            >
              Texto que se manda al GPS: <code>{command.attributes.data}</code>
            </Typography>
          )}
          {!commands.length && (
            <Alert severity="info" sx={{ mt: 1 }}>
              No hay comandos guardados. Créalos primero en Ajustes → Comandos guardados.
            </Alert>
          )}
        </Paper>

        {commandId !== '' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              ¿A qué vehículos?
            </Typography>
            {loadingRows && !rows.length ? (
              <CircularProgress size={24} />
            ) : (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Buscar por nombre o placa"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    sx={{ flex: 1 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>Tipo de GPS</InputLabel>
                    <Select
                      label="Tipo de GPS"
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value)}
                    >
                      <MenuItem value="all">Todos los tipos</MenuItem>
                      {types.map((type) => (
                        <MenuItem key={type.key} value={type.key}>
                          {type.label} ({type.usable})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                {usableRows.length > 0 ? (
                  <List dense disablePadding>
                    <ListItem disablePadding divider>
                      <ListItemButton dense onClick={toggleVisible}>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <Checkbox
                            edge="start"
                            checked={allVisibleSelected}
                            indeterminate={someVisibleSelected && !allVisibleSelected}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <strong>
                              {allVisibleSelected ? 'Quitar todos' : 'Seleccionar todos'} (
                              {usableRows.length})
                            </strong>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {usableRows.map((row) => (
                      <ListItem key={row.id} disablePadding divider>
                        <ListItemButton dense onClick={() => toggleDevice(row.id)}>
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            <Checkbox
                              edge="start"
                              checked={selectedIds.has(row.id)}
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={row.name}
                            secondary={[
                              typeLabel(row.protocol),
                              row.model?.trim(),
                              row.deviceStatus === 'online' ? 'En línea' : 'Desconectado',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            secondaryTypographyProps={{ sx: { wordBreak: 'break-word' } }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Alert severity="info">
                    {rows.some((row) => !row.reason)
                      ? 'Ningún vehículo coincide con la búsqueda.'
                      : 'Ningún vehículo puede recibir este comando ahora.'}
                  </Alert>
                )}

                {blockedRows.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => setShowBlocked(!showBlocked)}>
                      {showBlocked ? 'Ocultar' : 'Ver'}{' '}
                      {plural(
                        blockedRows.length,
                        'vehículo que no puede recibirlo',
                        'vehículos que no pueden recibirlo',
                      )}
                    </Button>
                    {showBlocked && (
                      <List dense disablePadding>
                        {blockedRows.map((row) => (
                          <ListItem key={row.id} divider>
                            <ListItemText
                              primary={row.name}
                              secondary={reasonText(row)}
                              primaryTypographyProps={{ color: 'text.secondary' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                )}
              </>
            )}
          </Paper>
        )}
      </Container>

      {commandId !== '' && (
        <Paper
          elevation={8}
          square
          sx={{
            position: 'sticky',
            bottom: 0,
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            zIndex: 2,
          }}
        >
          <Typography sx={{ flex: 1, minWidth: 160 }}>
            {selectedRows.length
              ? plural(selectedRows.length, 'vehículo seleccionado', 'vehículos seleccionados')
              : 'Marca uno o varios vehículos'}
          </Typography>
          <Button variant="contained" disabled={!selectedRows.length} onClick={openConfirm}>
            Enviar comando
          </Button>
        </Paper>
      )}

      <Dialog open={!!confirm} onClose={() => !sending && setConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>¿Enviar «{command?.description}»?</DialogTitle>
        {confirm && (
          <DialogContent>
            <Typography gutterBottom>
              A {plural(confirm.rows.length, 'vehículo', 'vehículos')}:{' '}
              {confirm.rows
                .slice(0, 8)
                .map((row) => row.name)
                .join(', ')}
              {confirm.rows.length > 8 ? ` y ${confirm.rows.length - 8} más` : ''}.
            </Typography>
            <Stack spacing={1} sx={{ my: 2 }}>
              {command?.type === 'custom' && selectedTypes.length > 1 && (
                <Alert severity="warning">
                  Es un comando personalizado y elegiste {selectedTypes.length} tipos de GPS
                  distintos ({selectedTypes.map(typeLabel).join(', ')}). A todos les llega el mismo
                  texto: revisa que todos lo entiendan.
                </Alert>
              )}
              {confirm.engine && (
                <Alert severity="error">
                  {isEngineStop(command)
                    ? `Vas a BLOQUEAR el motor de ${plural(confirm.rows.length, 'vehículo', 'vehículos')}. Si alguno va en marcha, se apagará.`
                    : `Vas a mandar un comando de motor a ${plural(confirm.rows.length, 'vehículo', 'vehículos')}.`}
                </Alert>
              )}
              {offlineSelected > 0 && (
                <Alert severity={confirm.noQueue ? 'warning' : 'info'}>
                  {plural(offlineSelected, 'está desconectado', 'están desconectados')}
                  {confirm.noQueue
                    ? ': no se les enviará (no se deja en cola).'
                    : ': lo recibirán cuando se conecten, aunque sea horas o días después.'}
                </Alert>
              )}
              {neverReportedSelected > 0 && (
                <Alert severity="info">
                  {plural(neverReportedSelected, 'nunca ha reportado', 'nunca han reportado')}: no
                  se sabe qué GPS tienen; si su GPS no entiende el comando, no hará nada.
                </Alert>
              )}
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirm.noQueue}
                  onChange={(event) => setConfirm({ ...confirm, noQueue: event.target.checked })}
                  disabled={sending}
                />
              }
              label="Si está desconectado, no dejarlo en cola"
              sx={{ mb: 1 }}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Esperar respuesta del GPS</InputLabel>
              <Select
                label="Esperar respuesta del GPS"
                value={wait}
                onChange={(event) => setWait(event.target.value)}
              >
                {WAIT_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {confirm.engine && (
              <FormControlLabel
                control={
                  <Checkbox
                    color="error"
                    checked={confirm.sure}
                    onChange={(event) => setConfirm({ ...confirm, sure: event.target.checked })}
                    disabled={sending}
                  />
                }
                label={`Sí, estoy seguro de enviar «${command?.description}» a ${plural(confirm.rows.length, 'vehículo', 'vehículos')}`}
                sx={{ mt: 2 }}
              />
            )}
            {sendError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                No se pudo enviar: {sendError}. Puedes reintentar: no se manda dos veces.
              </Alert>
            )}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={sending}>
            {t('sharedCancel')}
          </Button>
          <Button
            variant="contained"
            color={confirm?.engine ? 'error' : 'primary'}
            onClick={handleSend}
            disabled={sending || (confirm?.engine && !confirm.sure)}
          >
            {sending ? <CircularProgress size={20} /> : sendError ? 'Reintentar' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
};

export default BulkCommandsPage;
