// Menú de Transporte, en la columna izquierda.
//
// Mismo lugar y misma forma que el menú de Rutas y el de ajustes de Traccar —el cliente ya busca
// ahí las secciones—, pero con sus propios íconos: Transporte es otro servicio y no tiene por qué
// parecerse a Rutas más de lo que se parece cualquier pantalla de la aplicación.
//
// Grupos separados por una línea, en el orden en que se usa:
//   1. Hoy — lo que se mira todo el día.
//   2. Lo que se arma una vez: recorridos, horarios, pasajeros, conductores.
//   3. Lo que se comparte y se revisa: seguimiento, alertas, reportes, equipos.
//   4. Configuración.
//
// Mientras la cuenta no eligió su tipo de operación, el menú solo tiene «Hoy»: la única decisión
// pendiente está ahí, y un menú lleno de secciones invita a saltársela.
import { Fragment } from 'react';
import { Divider, List } from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';
import TimelineIcon from '@mui/icons-material/Timeline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import GroupsIcon from '@mui/icons-material/Groups';
import SchoolIcon from '@mui/icons-material/School';
import BadgeIcon from '@mui/icons-material/Badge';
import ShareLocationIcon from '@mui/icons-material/ShareLocation';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SensorsIcon from '@mui/icons-material/Sensors';
import TuneIcon from '@mui/icons-material/Tune';
import { useLocation } from 'react-router-dom';
import MenuItem from '../common/components/MenuItem';
import { seccionesVisibles, seccionDe } from './secciones';

const iconoDe = (clave, operacion) =>
  ({
    hoy: <TodayIcon />,
    recorridos: <TimelineIcon />,
    horarios: <ScheduleIcon />,
    pasajeros: operacion === 'escolar' ? <SchoolIcon /> : <GroupsIcon />,
    conductores: <BadgeIcon />,
    compartir: <ShareLocationIcon />,
    alertas: <NotificationsActiveIcon />,
    reportes: <AssessmentIcon />,
    equipos: <SensorsIcon />,
    configuracion: <TuneIcon />,
  })[clave];

const TransporteMenu = ({ operacion }) => {
  const { pathname } = useLocation();
  const abierta = seccionDe(pathname).clave;
  const grupos = operacion ? seccionesVisibles(operacion) : seccionesVisibles(null).slice(0, 1);

  return grupos.map((grupo, i) => (
    <Fragment key={grupo[0].clave}>
      {i > 0 && <Divider />}
      <List>
        {grupo.map((s) => (
          <MenuItem
            key={s.clave}
            title={s.titulo}
            link={s.ruta}
            icon={iconoDe(s.clave, operacion)}
            selected={abierta === s.clave}
          />
        ))}
      </List>
    </Fragment>
  ));
};

export default TransporteMenu;
