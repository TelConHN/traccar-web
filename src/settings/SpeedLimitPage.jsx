import { useState, useMemo } from 'react';
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
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import { useEffectAsync, useCatch } from '../reactHelper';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';

const KMH_TO_KNOTS = 1.852;

const toKmh = (knots) => (knots ? Math.round(knots * KMH_TO_KNOTS) : '');
const toKnots = (kmh) => parseFloat((Number(kmh) / KMH_TO_KNOTS).toFixed(10));

const GPS_COMMAND_GUIDE = [
  { brand: 'Teltonika FMB (FMB120, FMB920…)', template: 'setparam 11104:{speed}', note: '' },
  { brand: 'Istartek VT900 / VT600', template: 'W[CONTRASEÑA],005,{speed}', note: 'Contraseña 6 dígitos, por defecto: 000000' },
  { brand: 'Istartek VT-120L / VT-110L / VT-200L', template: '[CONTRASEÑA],212,1,1,{speed}', note: 'Contraseña 4 dígitos, por defecto: 0000' },
  { brand: 'Micodus MV710G / MV750G / ML100G', template: 'SPEED,ON,{speed},1#', note: 'Sin contraseña en el comando; acepta SMS solo del número autorizado' },
  { brand: 'Concox GT06 / GT06N', template: 'SPEED,ON,20,{speed},1#', note: '' },
  { brand: 'Coban / TK103', template: 'speed [CONTRASEÑA] {speed}', note: '' },
  { brand: 'Sinotrack ST-901', template: 'SPEED[CONTRASEÑA] {speed}', note: '' },
];

const SpeedLimitPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const admin = useAdministrator();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

  useEffectAsync(async () => { await loadDevices(''); }, []);

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

  const handleSave = useCatch(async (device) => {
    setSavingId(device.id);
    try {
      const speedKmh = Number(speedInputs[device.id]);
      const isSupported = supportedMap[device.id];
      const command = commandInputs[device.id] || '';

      const updated = {
        ...device,
        attributes: {
          ...device.attributes,
          speedLimit: toKnots(speedKmh),
          speedLimitSupported: isSupported,
          speedLimitCommand: command,
        },
      };

      await fetchOrThrow(`/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      if (isSupported && command && speedKmh > 0) {
        const commandText = command.replace('{speed}', speedKmh);
        await fetchOrThrow('/api/commands/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: device.id, type: 'custom', attributes: { data: commandText } }),
        });
      }

      setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
    } finally {
      setSavingId(null);
    }
  });

  // Clientes: usa el endpoint dedicado PUT /api/devices/{id}/speedlimit
  // que valida speedLimitEnabled en el servidor y solo toca ese atributo.
  const handleClientSave = useCatch(async (device) => {
    setSavingId(device.id);
    try {
      const speedKmh = Number(speedInputs[device.id]);
      const isSupported = !!device.attributes?.speedLimitSupported;
      const command = device.attributes?.speedLimitCommand || '';

      await fetchOrThrow(`/api/devices/${device.id}/speedlimit?speed=${speedKmh}`, {
        method: 'PUT',
      });

      if (isSupported && command && speedKmh > 0) {
        const commandText = command.replace('{speed}', speedKmh);
        await fetchOrThrow('/api/commands/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: device.id, type: 'custom', attributes: { data: commandText } }),
        });
      }

      const updated = {
        ...device,
        attributes: { ...device.attributes, speedLimit: toKnots(speedKmh) },
      };
      setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
    } finally {
      setSavingId(null);
    }
  });

  const groupsMap = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const filteredDevices = useMemo(() => devices.filter((d) => {
    if (filterName && !d.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterGroup && String(d.groupId) !== filterGroup) return false;
    return true;
  }), [devices, filterName, filterGroup]);

  // ── Vista Admin ───────────────────────────────────────────────────────────
  if (admin) {
    return (
      <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'speedLimitTitle']}>

        {/* Guía de comandos — expandida por defecto para que el admin la vea */}
        <Accordion disableGutters sx={{ mx: 2, mt: 2, mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" color="primary">{t('speedLimitGuide')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Marca / Modelo</strong></TableCell>
                    <TableCell><strong>Plantilla a configurar</strong></TableCell>
                    <TableCell><strong>Nota</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {GPS_COMMAND_GUIDE.map((row) => (
                    <TableRow key={row.brand}>
                      <TableCell>{row.brand}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{row.template}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{row.note}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, whiteSpace: 'pre-line' }}>
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
            <Select value={filterGroup} label={t('groupParent')} onChange={(e) => setFilterGroup(e.target.value)}>
              <MuiMenuItem value="">{t('sharedAll')}</MuiMenuItem>
              {groups.map((g) => <MuiMenuItem key={g.id} value={String(g.id)}>{g.name}</MuiMenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('settingsUser')}</InputLabel>
            <Select value={filterUser} label={t('settingsUser')} onChange={(e) => handleUserFilter(e.target.value)}>
              <MuiMenuItem value="">{t('sharedAll')}</MuiMenuItem>
              {users.map((u) => <MuiMenuItem key={u.id} value={String(u.id)}>{u.name}</MuiMenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {/* Tabla (desktop) / Cards (móvil) */}
        {isMobile ? (
          <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
            {filteredDevices.map((device) => {
              const hasSpeed = !!speedInputs[device.id];
              const isSupported = !!supportedMap[device.id];
              const hasCommand = !!(commandInputs[device.id] || '').trim();
              const canSave = hasSpeed && (!isSupported || hasCommand);
              return (
                <Card key={device.id} variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>{device.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {device.groupId ? groupsMap[device.groupId] : '—'}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {t('speedLimitCurrent')}: {device.attributes?.speedLimit ? `${toKmh(device.attributes.speedLimit)} km/h` : '—'}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label={t('speedLimitMax')}
                        inputProps={{ min: 0, max: 150, step: 1 }}
                        InputProps={{ endAdornment: <InputAdornment position="end">km/h</InputAdornment> }}
                        value={speedInputs[device.id] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setSpeedInputs((prev) => ({ ...prev, [device.id]: val }));
                          }
                        }}
                        sx={{ mb: 1 }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Checkbox
                          size="small"
                          checked={!!supportedMap[device.id]}
                          onChange={(e) => setSupportedMap((prev) => ({ ...prev, [device.id]: e.target.checked }))}
                        />
                        <Typography variant="body2">{t('speedLimitSupported')}</Typography>
                      </Box>
                      {isSupported && (
                        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', mb: 1 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label={t('speedLimitCommandTemplate')}
                            placeholder="setparam 11104:{speed}"
                            value={commandInputs[device.id] ?? ''}
                            onChange={(e) => setCommandInputs((prev) => ({ ...prev, [device.id]: e.target.value }))}
                          />
                          {savedCommands.length > 0 && (
                            <FormControl fullWidth size="small">
                              <Select
                                displayEmpty
                                value=""
                                onChange={(e) => {
                                  const cmd = savedCommands.find((c) => c.id === e.target.value);
                                  if (cmd?.attributes?.data) {
                                    setCommandInputs((prev) => ({ ...prev, [device.id]: cmd.attributes.data }));
                                  }
                                }}
                              >
                                <MuiMenuItem value="" disabled>{t('speedLimitPickCommand')}</MuiMenuItem>
                                {savedCommands.map((cmd) => (
                                  <MuiMenuItem key={cmd.id} value={cmd.id}>{cmd.description}</MuiMenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                        </Box>
                      )}
                      <Button
                        fullWidth
                        size="small"
                        variant={isSupported ? 'contained' : 'outlined'}
                        disabled={!canSave || savingId === device.id}
                        onClick={() => handleSave(device)}
                        startIcon={savingId === device.id ? <CircularProgress size={14} /> : null}
                      >
                        {isSupported ? t('speedLimitSaveAndSend') : t('sharedSave')}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
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
                  <TableCell className={classes.columnAction} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>{device.name}</TableCell>
                    <TableCell>{device.groupId ? groupsMap[device.groupId] : '—'}</TableCell>
                    <TableCell>
                      {device.attributes?.speedLimit
                        ? `${toKmh(device.attributes.speedLimit)} km/h`
                        : '—'}
                    </TableCell>
                    <TableCell>
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
                          }
                        }}
                        sx={{ width: 130 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={!!supportedMap[device.id]}
                        onChange={(e) =>
                          setSupportedMap((prev) => ({ ...prev, [device.id]: e.target.checked }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {supportedMap[device.id] && (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <TextField
                            size="small"
                            placeholder="setparam 11104:{speed}"
                            value={commandInputs[device.id] ?? ''}
                            onChange={(e) =>
                              setCommandInputs((prev) => ({ ...prev, [device.id]: e.target.value }))
                            }
                            sx={{ flex: 1 }}
                          />
                          <FormControl size="small" sx={{ minWidth: 160 }}>
                            <Select
                              displayEmpty
                              value=""
                              onChange={(e) => {
                                const cmd = savedCommands.find((c) => c.id === e.target.value);
                                if (cmd?.attributes?.data) {
                                  setCommandInputs((prev) => ({ ...prev, [device.id]: cmd.attributes.data }));
                                }
                              }}
                            >
                              <MuiMenuItem value="" disabled>{t('speedLimitPickCommand')}</MuiMenuItem>
                              {savedCommands.map((cmd) => (
                                <MuiMenuItem key={cmd.id} value={cmd.id}>{cmd.description}</MuiMenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell className={classes.columnAction} padding="none">
                      {(() => {
                        const hasSpeed = !!speedInputs[device.id];
                        const isSupported = !!supportedMap[device.id];
                        const hasCommand = !!(commandInputs[device.id] || '').trim();
                        const canSave = hasSpeed && (!isSupported || hasCommand);
                        return (
                          <Button
                            size="small"
                            variant={isSupported ? 'contained' : 'outlined'}
                            disabled={!canSave || savingId === device.id}
                            onClick={() => handleSave(device)}
                            startIcon={savingId === device.id ? <CircularProgress size={14} /> : null}
                          >
                            {isSupported ? t('speedLimitSaveAndSend') : t('sharedSave')}
                          </Button>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </PageLayout>
    );
  }

  // ── Vista Cliente (speedLimitEnabled) ─────────────────────────────────────
  const filteredOperatorDevices = devices.filter((d) =>
    !operatorFilter || d.name.toLowerCase().includes(operatorFilter.toLowerCase()),
  );

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'speedLimitTitle']}>
      <Box sx={{ p: 2 }}>
        <TextField
          size="small"
          label={t('sharedSearch')}
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        />
      </Box>

      {isMobile ? (
        <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
          {filteredOperatorDevices.map((device) => {
            const hasSpeed = !!speedInputs[device.id];
            const canSend = !!device.attributes?.speedLimitSupported && !!(device.attributes?.speedLimitCommand || '').trim();
            return (
              <Card key={device.id} variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>{device.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('speedLimitCurrent')}: {device.attributes?.speedLimit ? `${toKmh(device.attributes.speedLimit)} km/h` : t('speedLimitNotConfigured')}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label={t('speedLimitMax')}
                    inputProps={{ min: 0, max: 150, step: 1 }}
                    InputProps={{ endAdornment: <InputAdornment position="end">km/h</InputAdornment> }}
                    value={speedInputs[device.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d+$/.test(val)) {
                        setSpeedInputs((prev) => ({ ...prev, [device.id]: val }));
                      }
                    }}
                    sx={{ mb: 1 }}
                  />
                  <Button
                    fullWidth
                    size="small"
                    variant={canSend ? 'contained' : 'outlined'}
                    disabled={!hasSpeed || savingId === device.id}
                    onClick={() => handleClientSave(device)}
                    startIcon={savingId === device.id ? <CircularProgress size={14} /> : null}
                  >
                    {canSend ? t('speedLimitSaveAndSend') : t('sharedSave')}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table className={classes.table}>
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('speedLimitCurrent')}</TableCell>
                <TableCell>{t('speedLimitMax')}</TableCell>
                <TableCell className={classes.columnAction} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOperatorDevices.map((device) => {
                const hasSpeed = !!speedInputs[device.id];
                const canSend = !!device.attributes?.speedLimitSupported && !!(device.attributes?.speedLimitCommand || '').trim();
                return (
                  <TableRow key={device.id}>
                    <TableCell>{device.name}</TableCell>
                    <TableCell>
                      {device.attributes?.speedLimit ? (
                        `${toKmh(device.attributes.speedLimit)} km/h`
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {t('speedLimitNotConfigured')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
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
                          }
                        }}
                        sx={{ width: 130 }}
                      />
                    </TableCell>
                    <TableCell className={classes.columnAction} padding="none">
                      <Button
                        size="small"
                        variant={canSend ? 'contained' : 'outlined'}
                        disabled={!hasSpeed || savingId === device.id}
                        onClick={() => handleClientSave(device)}
                        startIcon={savingId === device.id ? <CircularProgress size={14} /> : null}
                      >
                        {canSend ? t('speedLimitSaveAndSend') : t('sharedSave')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </PageLayout>
  );
};

export default SpeedLimitPage;
