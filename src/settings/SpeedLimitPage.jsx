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
} from '@mui/material';
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

const SpeedLimitPage = () => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();
  const admin = useAdministrator();

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

  const groupsMap = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const filteredDevices = useMemo(() => devices.filter((d) => {
    if (filterName && !d.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterGroup && String(d.groupId) !== filterGroup) return false;
    return true;
  }), [devices, filterName, filterGroup]);

  if (admin) {
    return (
      <PageLayout menu={<SettingsMenu />} breadcrumbs={['settingsTitle', 'speedLimitTitle']}>
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
      </PageLayout>
    );
  }

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
      <Table className={classes.table}>
        <TableHead>
          <TableRow>
            <TableCell>{t('sharedName')}</TableCell>
            <TableCell>{t('speedLimitMax')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredOperatorDevices.map((device) => (
            <TableRow key={device.id}>
              <TableCell>{device.name}</TableCell>
              <TableCell>
                {device.attributes?.speedLimit ? (
                  <Typography variant="body2">
                    {`${toKmh(device.attributes.speedLimit)} km/h`}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t('speedLimitNotConfigured')}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageLayout>
  );
};

export default SpeedLimitPage;
