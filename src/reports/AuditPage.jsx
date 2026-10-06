import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  ListItemText,
  Skeleton,
  Table,
  TableRow,
  TableCell,
  TableHead,
  TableBody,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { formatTime } from '../common/util/formatter';
import { prefixString } from '../common/util/stringUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import ReportFilter, { updateReportParams } from './components/ReportFilter';
import usePersistedState from '../common/util/usePersistedState';
import ColumnSelect from './components/ColumnSelect';
import { useCatch, useEffectAsync } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import TableShimmer from '../common/components/TableShimmer';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';

const columnsArray = [
  ['actionTime', 'Hora'],
  ['user', 'Cuenta'],
  ['actionType', 'Acción'],
  ['object', 'Vehículo / objeto'],
  ['detail', 'Comando / detalle'],
  ['result', 'Respuesta del equipo'],
  ['address', 'IP'],
];
const columnsMap = new Map(columnsArray);

const actionTypes = [
  ['command', 'Comando'],
  ['login', 'Inicio de sesión'],
  ['logout', 'Cierre de sesión'],
  ['denied', 'Acceso denegado'],
  ['create', 'Creó'],
  ['edit', 'Editó'],
  ['remove', 'Eliminó'],
  ['link', 'Vinculó'],
  ['unlink', 'Desvinculó'],
  ['report', 'Reporte'],
  ['accumulators', 'Ajustó odómetro/horas'],
];
const actionTypeMap = new Map(actionTypes);

const objectTypeLabels = {
  device: 'Vehículo',
  user: 'Cuenta',
  group: 'Grupo',
  geofence: 'Geo-zona',
  driver: 'Conductor',
  calendar: 'Calendario',
  maintenance: 'Mantenimiento',
  notification: 'Notificación',
  command: 'Comando guardado',
  attribute: 'Atributo',
  order: 'Orden',
  token: 'Token',
};

const AuditPage = () => {
  const { classes } = useReportStyles();
  const t = useTranslation();
  const theme = useTheme();
  // En teléfono, tableta y laptop chica (con el menú lateral abierto, a 1024 px) la tabla dejaba la
  // respuesta del equipo fuera de la pantalla: ahí cada registro es una tarjeta con todo a la vista.
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [searchParams, setSearchParams] = useSearchParams();

  const devices = useSelector((state) => state.devices.items);
  const deviceList = useMemo(
    () => Object.values(devices).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [devices],
  );

  const [users, setUsers] = useState([]);
  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/users');
    const list = await response.json();
    setUsers(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  }, []);

  const userIds = searchParams.getAll('userId').map(Number);
  const deviceIds = searchParams.getAll('deviceId').map(Number);
  const selectedTypes = searchParams.getAll('actionType');

  const [columns, setColumns] = usePersistedState('auditColumnsV2', [
    'actionTime',
    'user',
    'actionType',
    'object',
    'detail',
    'result',
  ]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const onShow = useCatch(async ({ from, to }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      userIds.forEach((id) => query.append('userId', id));
      deviceIds.forEach((id) => query.append('deviceId', id));
      selectedTypes.forEach((type) => query.append('actionType', type));
      const response = await fetchOrThrow(`/api/audit?${query.toString()}`);
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  });

  const translated = (key, fallback) => t(key) || fallback;

  const commandLabel = (item) => {
    const type = item.attributes.commandType;
    const params = Object.entries(item.attributes)
      .filter(([key]) => key.startsWith('command.'))
      .map(([key, value]) => (key === 'command.data' ? value : `${key.slice(8)}: ${value}`));
    const parts = [];
    if (item.attributes.commandDescription) {
      parts.push(item.attributes.commandDescription);
    }
    if (type && (type !== 'custom' || !params.length)) {
      parts.push(translated(prefixString('command', type), type));
    }
    parts.push(...params);
    return parts.join(' · ');
  };

  const renderObject = (item) => {
    if (!item.objectType) {
      return '';
    }
    const typeLabel = objectTypeLabels[item.objectType] || item.objectType;
    const name = item.objectName || `#${item.objectId}`;
    const owner = item.attributes.ownerType
      ? `${objectTypeLabels[item.attributes.ownerType] || item.attributes.ownerType}: ${
          item.ownerName || `#${item.attributes.ownerId}`
        }`
      : null;
    return (
      <>
        <Typography variant="body2">
          {item.objectType === 'device' ? name : `${typeLabel}: ${name}`}
        </Typography>
        {owner && (
          <Typography variant="caption" color="textSecondary">
            con {owner}
          </Typography>
        )}
        {item.attributes.groupId && (
          <Typography variant="caption" color="textSecondary" display="block">
            (enviado al grupo)
          </Typography>
        )}
      </>
    );
  };

  const renderDetail = (item) => {
    if (item.actionType === 'command') {
      if (!item.attributes.commandType) {
        return (
          <Typography variant="caption" color="textSecondary">
            No registrado (comando anterior a esta versión)
          </Typography>
        );
      }
      const { status } = item.attributes;
      return (
        <>
          <Typography variant="body2">{commandLabel(item)}</Typography>
          {item.attributes.sms && (
            <Typography variant="caption" color="textSecondary" display="block">
              Por SMS
            </Typography>
          )}
          {status === 'queued' && (
            <Typography variant="caption" color="textSecondary" display="block">
              {item.queuedSentTime
                ? `Quedó en cola; se entregó ${formatTime(item.queuedSentTime, 'minutes')}`
                : 'En cola: el equipo no estaba conectado y aún no se ha entregado'}
            </Typography>
          )}
          {status === 'failed' && (
            <Typography variant="caption" color="error" display="block">
              No se pudo enviar{item.attributes.error ? `: ${item.attributes.error}` : ''}
            </Typography>
          )}
        </>
      );
    }
    if (item.actionType === 'report') {
      const type = item.attributes.type || '';
      return `${translated(prefixString('report', type), type)} · ${item.attributes.from} → ${
        item.attributes.to
      }${item.attributes.scheduled ? ' (programado)' : ''}`;
    }
    return '';
  };

  const renderResult = (item) => {
    if (item.actionType !== 'command') {
      return '';
    }
    if (item.commandResult != null) {
      return (
        <>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {item.commandResult}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatTime(item.commandResultTime)}
          </Typography>
        </>
      );
    }
    if (item.attributes.status === 'failed') {
      return '';
    }
    if (item.attributes.status === 'queued' && !item.queuedSentTime) {
      return (
        <Typography variant="caption" color="textSecondary">
          Pendiente
        </Typography>
      );
    }
    return (
      <Typography variant="caption" color="textSecondary">
        Sin respuesta
      </Typography>
    );
  };

  const renderCell = (item, key) => {
    switch (key) {
      case 'actionTime':
        return formatTime(item.actionTime, 'minutes');
      case 'user':
        if (!item.userId) {
          return '';
        }
        return (
          <>
            <Typography variant="body2">{item.userName || `#${item.userId}`}</Typography>
            {item.userEmail && item.userEmail !== item.userName && (
              <Typography variant="caption" color="textSecondary">
                {item.userEmail}
              </Typography>
            )}
          </>
        );
      case 'actionType':
        return actionTypeMap.get(item.actionType) || item.actionType;
      case 'object':
        return renderObject(item);
      case 'detail':
        return renderDetail(item);
      case 'result':
        return renderResult(item);
      default:
        return item[key];
    }
  };

  // Lo mismo que se ve en pantalla, pero en texto plano para Excel.
  const textCell = (item, key) => {
    const { attributes } = item;
    switch (key) {
      case 'actionTime':
        return formatTime(item.actionTime, 'minutes');
      case 'user':
        if (!item.userId) {
          return '';
        }
        return [
          item.userName || `#${item.userId}`,
          item.userEmail !== item.userName && item.userEmail,
        ]
          .filter(Boolean)
          .join(' — ');
      case 'actionType':
        return actionTypeMap.get(item.actionType) || item.actionType;
      case 'object': {
        if (!item.objectType) {
          return '';
        }
        const name = item.objectName || `#${item.objectId}`;
        const parts = [
          item.objectType === 'device'
            ? name
            : `${objectTypeLabels[item.objectType] || item.objectType}: ${name}`,
        ];
        if (attributes.ownerType) {
          parts.push(
            `con ${objectTypeLabels[attributes.ownerType] || attributes.ownerType}: ${
              item.ownerName || `#${attributes.ownerId}`
            }`,
          );
        }
        if (attributes.groupId) {
          parts.push('(enviado al grupo)');
        }
        return parts.join(' ');
      }
      case 'detail': {
        if (item.actionType === 'command') {
          if (!attributes.commandType) {
            return 'No registrado (comando anterior a esta versión)';
          }
          const parts = [commandLabel(item)];
          if (attributes.sms) {
            parts.push('Por SMS');
          }
          if (attributes.status === 'queued') {
            parts.push(
              item.queuedSentTime
                ? `Quedó en cola; se entregó ${formatTime(item.queuedSentTime, 'minutes')}`
                : 'En cola: el equipo no estaba conectado y aún no se ha entregado',
            );
          }
          if (attributes.status === 'failed') {
            parts.push(`No se pudo enviar${attributes.error ? `: ${attributes.error}` : ''}`);
          }
          return parts.join(' — ');
        }
        return renderDetail(item);
      }
      case 'result':
        if (item.commandResult != null) {
          return `${item.commandResult} (${formatTime(item.commandResultTime)})`;
        }
        if (item.actionType !== 'command' || attributes.status === 'failed') {
          return '';
        }
        return attributes.status === 'queued' && !item.queuedSentTime
          ? 'Pendiente'
          : 'Sin respuesta';
      default:
        return item[key] ?? '';
    }
  };

  const onExport = useCatch(async () => {
    const rows = items.map((item) => {
      const row = {};
      columns.forEach((key) => {
        row[columnsMap.get(key)] = textCell(item, key);
      });
      return row;
    });
    await exportExcel(t('reportAudit'), 'auditoria.xlsx', new Map([['Auditoría', rows]]), theme);
  });

  const selectedUsers = users.filter((user) => userIds.includes(user.id));
  const selectedDevices = deviceList.filter((device) => deviceIds.includes(device.id));

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportAudit']}>
      <div className={classes.header}>
        <ReportFilter onShow={onShow} onExport={onExport} deviceType="none" loading={loading}>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={users}
              value={selectedUsers}
              onChange={(_, value) =>
                updateReportParams(
                  searchParams,
                  setSearchParams,
                  'userId',
                  value.map((user) => user.id),
                )
              }
              getOptionLabel={(user) => user.name || user.email || ''}
              filterOptions={(options, { inputValue }) => {
                const text = inputValue.trim().toLowerCase();
                return options.filter((user) =>
                  `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(text),
                );
              }}
              renderOption={(props, user) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <ListItemText
                      primary={user.name}
                      secondary={user.email !== user.name ? user.email : null}
                    />
                  </li>
                );
              }}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Ninguna cuenta coincide"
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Clientes / cuentas"
                  placeholder={selectedUsers.length ? undefined : 'Todas'}
                  helperText="Lo que hizo la cuenta y lo que se hizo a sus carros"
                />
              )}
            />
          </div>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={deviceList}
              value={selectedDevices}
              onChange={(_, value) =>
                updateReportParams(
                  searchParams,
                  setSearchParams,
                  'deviceId',
                  value.map((device) => device.id),
                )
              }
              getOptionLabel={(device) => device.name || ''}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Ningún vehículo coincide"
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vehículos"
                  placeholder={selectedDevices.length ? undefined : 'Todos'}
                />
              )}
            />
          </div>
          <div className={classes.filterItem}>
            <Autocomplete
              multiple
              size="small"
              options={actionTypes.map(([key]) => key)}
              value={selectedTypes}
              onChange={(_, value) =>
                updateReportParams(searchParams, setSearchParams, 'actionType', value)
              }
              getOptionLabel={(key) => actionTypeMap.get(key) || key}
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Acciones"
                  placeholder={selectedTypes.length ? undefined : 'Todas'}
                />
              )}
            />
          </div>
          <ColumnSelect
            columns={columns}
            setColumns={setColumns}
            columnsArray={columnsArray}
            rawValues
          />
        </ReportFilter>
      </div>
      {narrow ? (
        <Box>
          {!loading
            ? items.map((item) => (
                <Box key={item.id} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2">
                    {columns.includes('actionTime') && formatTime(item.actionTime, 'minutes')}
                    {columns.includes('actionTime') && columns.includes('actionType') && ' · '}
                    {columns.includes('actionType') && renderCell(item, 'actionType')}
                  </Typography>
                  {columns
                    .filter((key) => key !== 'actionTime' && key !== 'actionType')
                    .map((key) => {
                      const value = renderCell(item, key);
                      if (value === '' || value == null) {
                        return null;
                      }
                      return (
                        <Box key={key} sx={{ mt: 1 }}>
                          <Typography variant="caption" color="textSecondary">
                            {columnsMap.get(key)}
                          </Typography>
                          <Box sx={{ wordBreak: 'break-word' }}>{value}</Box>
                        </Box>
                      );
                    })}
                </Box>
              ))
            : [0, 1, 2].map((index) => (
                <Box key={index} sx={{ px: 2, py: 1.5 }}>
                  <Skeleton />
                  <Skeleton width="60%" />
                </Box>
              ))}
        </Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((key) => (
                <TableCell key={key}>{columnsMap.get(key)}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading ? (
              items.map((item) => (
                <TableRow key={item.id}>
                  {columns.map((key) => (
                    <TableCell key={key} sx={{ verticalAlign: 'top', maxWidth: 320 }}>
                      {renderCell(item, key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableShimmer columns={columns.length} />
            )}
          </TableBody>
        </Table>
      )}
    </PageLayout>
  );
};

export default AuditPage;
