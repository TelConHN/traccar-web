import { Fragment, useState, useMemo, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Table,
  TableRow,
  TableCell,
  TableHead,
  TableBody,
  TextField,
  Button,
  InputAdornment,
  CircularProgress,
  Box,
  MenuItem as MuiMenuItem,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Card,
  CardContent,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import SpeedLimitHistoryDialog, { speedLimitAuthor } from './components/SpeedLimitHistoryDialog';
import { useEffectAsync, useCatch } from '../reactHelper';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatTime } from '../common/util/formatter';

const KMH_TO_KNOTS = 1.852;

const toKmh = (knots) => (knots ? Math.round(knots * KMH_TO_KNOTS) : '');

const GPS_COMMAND_GUIDE = [
  { brand: 'Teltonika FMB (FMB120, FMB920…)', template: 'setparam 11104:{speed}', note: '' },
  {
    brand: 'Istartek VT900 / VT600',
    template: 'W[CONTRASEÑA],005,{speed}',
    note: 'Contraseña 6 dígitos, por defecto: 000000',
  },
  {
    brand: 'Istartek VT-120L / VT-110L / VT-200L',
    template: '[CONTRASEÑA],212,1,1,{speed}',
    note: 'Contraseña 4 dígitos, por defecto: 0000',
  },
  {
    brand: 'Micodus MV710G / MV750G / ML100G',
    template: 'SPEED,ON,{speed},1#',
    note: 'Sin contraseña en el comando; acepta SMS solo del número autorizado',
  },
  { brand: 'Concox GT06 / GT06N', template: 'SPEED,ON,20,{speed},1#', note: '' },
  { brand: 'Coban / TK103', template: 'speed [CONTRASEÑA] {speed}', note: '' },
  { brand: 'Sinotrack ST-901', template: 'SPEED[CONTRASEÑA] {speed}', note: '' },
];

// Lo que contestó el servidor al enviar, dicho para quien está mirando: [gravedad, texto].
const resultNotice = (body, speed) => {
  switch (body.commandStatus) {
    case 'sent':
      return [
        'success',
        `Enviado al GPS: ${speed} km/h. La respuesta del equipo queda en el historial.`,
      ];
    case 'queued':
      return [
        'info',
        `Guardado en ${speed} km/h. El GPS está desconectado: se le enviará apenas se conecte.`,
      ];
    case 'failed':
      return [
        'error',
        `Se guardó ${speed} km/h pero no se pudo enviar al GPS${body.error ? `: ${body.error}` : ''}.`,
      ];
    default:
      return ['success', `Guardado: la plataforma avisará si el vehículo pasa de ${speed} km/h.`];
  }
};

const SpeedLimitPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const admin = useAdministrator();
  const theme = useTheme();
  // El administrador tiene más columnas: por debajo de 1200 px la tabla dejaba el botón fuera de la
  // pantalla, así que ahí van tarjetas.
  const isMobile = useMediaQuery(theme.breakpoints.down(admin ? 'lg' : 'md'));

  const [devices, setDevices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [savedCommands, setSavedCommands] = useState([]);

  const [speedInputs, setSpeedInputs] = useState({});
  const [commandInputs, setCommandInputs] = useState({});
  const [supportedMap, setSupportedMap] = useState({});
  const [savingId, setSavingId] = useState(null);

  const [filterName, setFilterName] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');

  const [lastChanges, setLastChanges] = useState({});
  // Hasta cuándo (hora de este navegador) no se puede volver a enviar a cada carro.
  const [cooldownUntil, setCooldownUntil] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [notices, setNotices] = useState({});
  const [historyDevice, setHistoryDevice] = useState(null);
  const [overspeed, setOverspeed] = useState(null);

  const startCooldown = useCallback((deviceId, seconds) => {
    if (seconds > 0) {
      setNow(Date.now());
      setCooldownUntil((prev) => ({ ...prev, [deviceId]: Date.now() + seconds * 1000 }));
    }
  }, []);

  const loadLastChanges = useCallback(async () => {
    const response = await fetchOrThrow('/api/devices/speedlimit/last');
    const data = await response.json();
    setLastChanges(data);
    Object.entries(data).forEach(([deviceId, entry]) => startCooldown(deviceId, entry.cooldown));
  }, [startCooldown]);

  // El reloj solo corre mientras algún carro está en espera.
  const waiting = Object.values(cooldownUntil).some((until) => until > now);
  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const cooldownOf = (deviceId) =>
    Math.max(0, Math.ceil(((cooldownUntil[deviceId] || 0) - now) / 1000));

  const setNotice = (deviceId, notice) => setNotices((prev) => ({ ...prev, [deviceId]: notice }));

  const loadDevices = async (userId) => {
    const query = userId ? `?userId=${userId}` : '';
    const res = await fetchOrThrow(`/api/devices${query}`);
    const data = await res.json();
    setDevices(data);
    const speeds = {};
    const commands = {};
    const supported = {};
    data.forEach((d) => {
      speeds[d.id] = toKmh(d.attributes?.speedLimit) ?? '';
      commands[d.id] = d.attributes?.speedLimitCommand || '';
      supported[d.id] = !!d.attributes?.speedLimitSupported;
    });
    setSpeedInputs(speeds);
    setCommandInputs(commands);
    setSupportedMap(supported);
  };

  useEffectAsync(async () => {
    await Promise.all([loadDevices(''), loadLastChanges()]);
  }, []);

  useEffectAsync(async () => {
    if (!admin) return;
    const [grRes, usrRes, cmdRes] = await Promise.all([
      fetchOrThrow('/api/groups'),
      fetchOrThrow('/api/users'),
      fetchOrThrow('/api/commands'),
    ]);
    setGroups(await grRes.json());
    setUsers(await usrRes.json());
    setSavedCommands(await cmdRes.json());
  }, [admin]);

  const handleUserFilter = useCatch(async (userId) => {
    setFilterUser(userId);
    await loadDevices(userId);
  });

  // Todo cambio de límite pasa por el mismo lugar del servidor, que es el que decide si se puede: espera
  // de 30 s, mismo valor, vehículo en exceso. Aquí solo se explica lo que contestó.
  const sendLimit = async (device, { resend = false, force = false } = {}) => {
    const speed = Number(speedInputs[device.id]);
    const query = new URLSearchParams({ speed });
    if (resend) query.set('resend', 'true');
    if (force) query.set('force', 'true');
    const response = await fetch(`/api/devices/${device.id}/speedlimit?${query}`, {
      method: 'PUT',
    });
    // Los rechazos (espera, mismo valor, exceso) vienen en JSON; cualquier otro error, en texto.
    const body = await response.json().catch(() => null);
    if (response.ok && body) {
      startCooldown(device.id, body.cooldown);
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? { ...d, attributes: { ...d.attributes, speedLimit: speed / KMH_TO_KNOTS } }
            : d,
        ),
      );
      const [severity, text] = resultNotice(body, speed);
      setNotice(device.id, { severity, text });
      await loadLastChanges();
      return;
    }
    switch (body?.error) {
      case 'cooldown':
        startCooldown(device.id, body.seconds);
        setNotice(device.id, {
          severity: 'warning',
          text: 'El límite de este vehículo se acaba de cambiar. Espere a que termine la cuenta para volver a enviar.',
        });
        return;
      case 'unchanged':
        setNotice(device.id, {
          severity: 'info',
          text: `Ya está en ${body.speed} km/h; no se volvió a enviar.`,
        });
        return;
      case 'overspeed':
        if (body.canForce) {
          setOverspeed({ device, speed: body.speed, limit: body.limit, resend });
        } else {
          setNotice(device.id, {
            severity: 'error',
            text: `El vehículo va a ${body.speed} km/h, por encima del límite actual de ${body.limit} km/h. Cambiarlo ahora puede dejar trabado el corte de motor: inténtelo cuando baje la velocidad.`,
          });
        }
        return;
      default:
        throw new Error(body?.message || `No se pudo cambiar el límite (${response.status})`);
    }
  };

  const configChanged = (device) =>
    supportedMap[device.id] !== !!device.attributes?.speedLimitSupported ||
    (commandInputs[device.id] || '') !== (device.attributes?.speedLimitCommand || '');

  const handleSave = useCatch(async (device, options = {}) => {
    setSavingId(device.id);
    setNotice(device.id, null);
    try {
      // La configuración del limitador se guarda aparte; el límite en sí va por sendLimit.
      if (admin && configChanged(device)) {
        const updated = {
          ...device,
          attributes: {
            ...device.attributes,
            speedLimitSupported: supportedMap[device.id],
            speedLimitCommand: commandInputs[device.id] || '',
          },
        };
        await fetchOrThrow(`/api/devices/${device.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
        if (
          Number(speedInputs[device.id]) === toKmh(device.attributes?.speedLimit) &&
          !options.resend
        ) {
          setNotice(device.id, {
            severity: 'success',
            text: 'Configuración del limitador guardada.',
          });
          return;
        }
        await sendLimit(updated, options);
        return;
      }
      await sendLimit(device, options);
    } finally {
      setSavingId(null);
    }
  });

  const confirmOverspeed = useCatch(async () => {
    const { device, resend } = overspeed;
    setOverspeed(null);
    await handleSave(device, { resend, force: true });
  });

  // Qué hace el botón de cada carro y si se puede apretar.
  const actionOf = (device) => {
    const current = toKmh(device.attributes?.speedLimit);
    const input = speedInputs[device.id];
    const hasSpeed = input !== '' && input != null && Number(input) > 0;
    const same = hasSpeed && Number(input) === current;
    const hardwareSaved =
      !!device.attributes?.speedLimitSupported &&
      !!(device.attributes?.speedLimitCommand || '').trim();
    const isSupported = admin ? !!supportedMap[device.id] : hardwareSaved;
    const changed = admin && configChanged(device);
    const missingTemplate = admin && isSupported && !(commandInputs[device.id] || '').trim();
    const cooldown = cooldownOf(device.id);
    const saving = savingId === device.id;

    let label = isSupported ? t('speedLimitSaveAndSend') : t('sharedSave');
    let resend = false;
    let hint = null;
    if (admin && same && !changed && hardwareSaved) {
      label = 'Reenviar al GPS';
      resend = true;
      hint = `Ya está en ${current} km/h`;
    } else if (same && !changed) {
      hint = `Ya está en ${current} km/h`;
    }
    if (cooldown > 0) {
      label = `Espere ${cooldown} s`;
      hint = 'Para no saturar el GPS, se espera 30 s entre envíos al mismo vehículo';
    }
    const disabled =
      saving || cooldown > 0 || !hasSpeed || missingTemplate || (same && !changed && !resend);
    return {
      label,
      resend,
      hint,
      disabled,
      saving,
      isSupported,
    };
  };

  const renderLastChange = (device) => {
    const entry = lastChanges[device.id];
    if (!entry) {
      return null;
    }
    return (
      <Typography variant="caption" color="text.secondary" display="block">
        {`Cambiado ${dayjs(entry.time).fromNow()} (${formatTime(entry.time, 'minutes')}) por ${speedLimitAuthor(entry, admin)}`}
      </Typography>
    );
  };

  const renderCurrent = (device) => (
    <>
      <Typography variant="body2">
        {device.attributes?.speedLimit
          ? `${toKmh(device.attributes.speedLimit)} km/h`
          : t('speedLimitNotConfigured')}
      </Typography>
      {renderLastChange(device)}
    </>
  );

  const renderSpeedInput = (device, props = {}) => (
    <TextField
      size="small"
      type="number"
      inputProps={{ min: 0, max: 150, step: 1 }}
      InputProps={{ endAdornment: <InputAdornment position="end">km/h</InputAdornment> }}
      value={speedInputs[device.id] ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '' || /^\d+$/.test(val)) {
          setSpeedInputs((prev) => ({ ...prev, [device.id]: val }));
          setNotice(device.id, null);
        }
      }}
      {...props}
    />
  );

  const renderActions = (device, fullWidth) => {
    const action = actionOf(device);
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          alignItems: fullWidth ? 'stretch' : 'flex-end',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: fullWidth ? 'stretch' : 'flex-end',
          }}
        >
          <Button
            size="small"
            variant={action.isSupported && !action.resend ? 'contained' : 'outlined'}
            disabled={action.disabled}
            onClick={() => handleSave(device, { resend: action.resend })}
            startIcon={action.saving ? <CircularProgress size={14} /> : null}
            sx={{ flex: fullWidth ? 1 : 'none', whiteSpace: 'nowrap', minWidth: 120 }}
          >
            {action.label}
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={<HistoryIcon />}
            onClick={() => setHistoryDevice(device)}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Historial
          </Button>
        </Box>
        {action.hint && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: fullWidth ? 'left' : 'right', maxWidth: fullWidth ? 'none' : 260 }}
          >
            {action.hint}
          </Typography>
        )}
      </Box>
    );
  };

  const renderNotice = (device) => {
    const notice = notices[device.id];
    if (!notice) {
      return null;
    }
    return (
      <Alert severity={notice.severity} onClose={() => setNotice(device.id, null)} sx={{ mt: 1 }}>
        {notice.text}
      </Alert>
    );
  };

  // En la tabla, el aviso va en un renglón propio a lo ancho: dentro de una columna quedaba apretado.
  const renderNoticeRow = (device, columns) =>
    notices[device.id] ? (
      <TableRow>
        <TableCell colSpan={columns} sx={{ pt: 0 }}>
          {renderNotice(device)}
        </TableCell>
      </TableRow>
    ) : null;

  const groupsMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);

  const filteredDevices = useMemo(
    () =>
      devices.filter((d) => {
        if (filterName && !d.name.toLowerCase().includes(filterName.toLowerCase())) return false;
        if (filterGroup && String(d.groupId) !== filterGroup) return false;
        return true;
      }),
    [devices, filterName, filterGroup],
  );

  const dialogs = (
    <>
      <SpeedLimitHistoryDialog
        device={historyDevice}
        admin={admin}
        onClose={() => setHistoryDevice(null)}
      />
      <Dialog open={!!overspeed} onClose={() => setOverspeed(null)} maxWidth="xs">
        <DialogTitle>El vehículo va en exceso</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {overspeed &&
              `${overspeed.device.name} va a ${overspeed.speed} km/h, por encima del límite actual de ${overspeed.limit} km/h.`}
          </DialogContentText>
          <DialogContentText sx={{ mt: 1 }}>
            Cambiar el límite mientras el GPS está cortando dejó la salida trabada en otros
            vehículos. Si igual hay que hacerlo, revise después que el corte se haya soltado.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverspeed(null)}>Esperar</Button>
          <Button color="warning" onClick={confirmOverspeed}>
            Enviar de todos modos
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  // ── Vista Admin ───────────────────────────────────────────────────────────
  if (admin) {
    return (
      <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'speedLimitTitle']}>
        {/* Guía de comandos — expandida por defecto para que el admin la vea */}
        <Accordion disableGutters sx={{ mx: 2, mt: 2, mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" color="primary">
              {t('speedLimitGuide')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Marca / Modelo</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Plantilla a configurar</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Nota</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {GPS_COMMAND_GUIDE.map((row) => (
                    <TableRow key={row.brand}>
                      <TableCell>{row.brand}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {row.template}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {row.note}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1, whiteSpace: 'pre-line' }}
            >
              {t('speedLimitGuideNote')}
            </Typography>
          </AccordionDetails>
        </Accordion>

        {/* Filtros */}
        <Box sx={{ display: 'flex', gap: 2, p: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label={t('sharedName')}
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            sx={{ minWidth: 180 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('groupParent')}</InputLabel>
            <Select
              value={filterGroup}
              label={t('groupParent')}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <MuiMenuItem value="">{t('sharedAll')}</MuiMenuItem>
              {groups.map((g) => (
                <MuiMenuItem key={g.id} value={String(g.id)}>
                  {g.name}
                </MuiMenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('settingsUser')}</InputLabel>
            <Select
              value={filterUser}
              label={t('settingsUser')}
              onChange={(e) => handleUserFilter(e.target.value)}
            >
              <MuiMenuItem value="">{t('sharedAll')}</MuiMenuItem>
              {users.map((u) => (
                <MuiMenuItem key={u.id} value={String(u.id)}>
                  {u.name}
                </MuiMenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Tabla (desktop) / Cards (móvil) */}
        {isMobile ? (
          <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
            {filteredDevices.map((device) => (
              <Card key={device.id} variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2">{device.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {device.groupId ? groupsMap[device.groupId] : '—'}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {t('speedLimitCurrent')}
                  </Typography>
                  {renderCurrent(device)}
                  <Box sx={{ mt: 1.5 }}>
                    {renderSpeedInput(device, {
                      fullWidth: true,
                      label: t('speedLimitMax'),
                      sx: { mb: 1 },
                    })}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Checkbox
                        size="small"
                        checked={!!supportedMap[device.id]}
                        onChange={(e) =>
                          setSupportedMap((prev) => ({ ...prev, [device.id]: e.target.checked }))
                        }
                      />
                      <Typography variant="body2">{t('speedLimitSupported')}</Typography>
                    </Box>
                    {supportedMap[device.id] && (
                      <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', mb: 1 }}>
                        <TextField
                          fullWidth
                          size="small"
                          label={t('speedLimitCommandTemplate')}
                          placeholder="setparam 11104:{speed}"
                          value={commandInputs[device.id] ?? ''}
                          onChange={(e) =>
                            setCommandInputs((prev) => ({ ...prev, [device.id]: e.target.value }))
                          }
                        />
                        {savedCommands.length > 0 && (
                          <FormControl fullWidth size="small">
                            <Select
                              displayEmpty
                              value=""
                              onChange={(e) => {
                                const cmd = savedCommands.find((c) => c.id === e.target.value);
                                if (cmd?.attributes?.data) {
                                  setCommandInputs((prev) => ({
                                    ...prev,
                                    [device.id]: cmd.attributes.data,
                                  }));
                                }
                              }}
                            >
                              <MuiMenuItem value="" disabled>
                                {t('speedLimitPickCommand')}
                              </MuiMenuItem>
                              {savedCommands.map((cmd) => (
                                <MuiMenuItem key={cmd.id} value={cmd.id}>
                                  {cmd.description}
                                </MuiMenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      </Box>
                    )}
                    {renderActions(device, true)}
                    {renderNotice(device)}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table className={classes.table}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('sharedName')}</TableCell>
                  <TableCell>{t('groupParent')}</TableCell>
                  <TableCell>{t('speedLimitCurrent')}</TableCell>
                  <TableCell>{t('speedLimitMax')}</TableCell>
                  <TableCell>{t('speedLimitSupported')}</TableCell>
                  <TableCell>{t('speedLimitCommandTemplate')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDevices.map((device) => (
                  <Fragment key={device.id}>
                    <TableRow>
                      <TableCell sx={{ verticalAlign: 'top' }}>{device.name}</TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        {device.groupId ? groupsMap[device.groupId] : '—'}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top', maxWidth: 220 }}>
                        {renderCurrent(device)}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        {renderSpeedInput(device, { sx: { width: 130 } })}
                      </TableCell>
                      <TableCell align="center" sx={{ verticalAlign: 'top' }}>
                        <Checkbox
                          checked={!!supportedMap[device.id]}
                          onChange={(e) =>
                            setSupportedMap((prev) => ({ ...prev, [device.id]: e.target.checked }))
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        {supportedMap[device.id] && (
                          <Box
                            sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
                          >
                            <TextField
                              size="small"
                              placeholder="setparam 11104:{speed}"
                              value={commandInputs[device.id] ?? ''}
                              onChange={(e) =>
                                setCommandInputs((prev) => ({
                                  ...prev,
                                  [device.id]: e.target.value,
                                }))
                              }
                              sx={{ flex: 1, minWidth: 160 }}
                            />
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                              <Select
                                displayEmpty
                                value=""
                                onChange={(e) => {
                                  const cmd = savedCommands.find((c) => c.id === e.target.value);
                                  if (cmd?.attributes?.data) {
                                    setCommandInputs((prev) => ({
                                      ...prev,
                                      [device.id]: cmd.attributes.data,
                                    }));
                                  }
                                }}
                              >
                                <MuiMenuItem value="" disabled>
                                  {t('speedLimitPickCommand')}
                                </MuiMenuItem>
                                {savedCommands.map((cmd) => (
                                  <MuiMenuItem key={cmd.id} value={cmd.id}>
                                    {cmd.description}
                                  </MuiMenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        {renderActions(device, false)}
                      </TableCell>
                    </TableRow>
                    {renderNoticeRow(device, 7)}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        {dialogs}
      </PageLayout>
    );
  }

  // ── Vista Cliente (speedLimitEnabled) ─────────────────────────────────────
  const filteredOperatorDevices = devices.filter(
    (d) => !operatorFilter || d.name.toLowerCase().includes(operatorFilter.toLowerCase()),
  );

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'speedLimitTitle']}>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert severity="info">
          Después de enviar un límite, espere 30 segundos para volver a cambiar el del mismo
          vehículo. Si el vehículo va en exceso en ese momento, el cambio se podrá hacer cuando baje
          la velocidad.
        </Alert>
        <TextField
          size="small"
          label={t('sharedSearch')}
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          sx={{ minWidth: 220, alignSelf: 'flex-start' }}
        />
      </Box>

      {isMobile ? (
        <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
          {filteredOperatorDevices.map((device) => (
            <Card key={device.id} variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  {device.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('speedLimitCurrent')}
                </Typography>
                {renderCurrent(device)}
                <Divider sx={{ my: 1.5 }} />
                {renderSpeedInput(device, {
                  fullWidth: true,
                  label: t('speedLimitMax'),
                  sx: { mb: 1 },
                })}
                {renderActions(device, true)}
                {renderNotice(device)}
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table className={classes.table}>
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('speedLimitCurrent')}</TableCell>
                <TableCell>{t('speedLimitMax')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOperatorDevices.map((device) => (
                <Fragment key={device.id}>
                  <TableRow>
                    <TableCell sx={{ verticalAlign: 'top' }}>{device.name}</TableCell>
                    <TableCell sx={{ verticalAlign: 'top', maxWidth: 280 }}>
                      {renderCurrent(device)}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      {renderSpeedInput(device, { sx: { width: 130 } })}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      {renderActions(device, false)}
                    </TableCell>
                  </TableRow>
                  {renderNoticeRow(device, 4)}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      {dialogs}
    </PageLayout>
  );
};

export default SpeedLimitPage;
