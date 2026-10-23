import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatNotificationTitle, formatTime } from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { eventsActions } from '../store';
import { useEffectAsync } from '../reactHelper';

const useStyles = makeStyles()((theme) => ({
  drawer: {
    width: theme.dimensions.eventsDrawerWidth,
  },
  toolbar: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  title: {
    flexGrow: 1,
  },
}));

const EventsDrawer = ({ open, onClose }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);

  const events = useSelector((state) => state.events.items);

  // Un evento puede ser de un carro que no está en la lista cargada (borrado, desvinculado o de los
  // guardados de otro día): antes salía "undefined". Se busca su nombre una vez.
  const [extraNames, setExtraNames] = useState({});
  const missingKey = [
    ...new Set(events.map((event) => event.deviceId).filter((id) => !devices[id])),
  ].join(',');
  useEffectAsync(async () => {
    const ids = missingKey ? missingKey.split(',').filter((id) => !(id in extraNames)) : [];
    if (!ids.length) {
      return;
    }
    const names = {};
    ids.forEach((id) => {
      names[id] = null;
    });
    try {
      const query = new URLSearchParams();
      ids.forEach((id) => query.append('id', id));
      const response = await fetch(`/api/devices?${query.toString()}`);
      if (response.ok) {
        (await response.json()).forEach((device) => {
          names[device.id] = device.name;
        });
      }
    } catch {
      // queda el texto genérico
    }
    setExtraNames((current) => ({ ...current, ...names }));
  }, [missingKey]);

  const deviceName = (deviceId) =>
    devices[deviceId]?.name || extraNames[deviceId] || `Vehículo #${deviceId}`;

  const formatType = (event) =>
    formatNotificationTitle(t, {
      type: event.type,
      attributes: {
        alarms: event.attributes.alarm,
      },
    });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Toolbar className={classes.toolbar} disableGutters>
        <Typography variant="h6" className={classes.title}>
          {t('reportEvents')}
        </Typography>
        <IconButton
          size="small"
          color="inherit"
          onClick={() => dispatch(eventsActions.deleteAll())}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Toolbar>
      <List className={classes.drawer} dense>
        {events.map((event) => (
          <ListItemButton
            key={event.id}
            onClick={() => navigate(`/event/${event.id}`)}
            disabled={!event.id}
          >
            <ListItemText
              primary={`${deviceName(event.deviceId)} • ${formatType(event)}`}
              secondary={formatTime(event.eventTime, 'seconds')}
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(eventsActions.delete(event));
              }}
            >
              <DeleteIcon fontSize="small" className={classes.delete} />
            </IconButton>
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
};

export default EventsDrawer;
