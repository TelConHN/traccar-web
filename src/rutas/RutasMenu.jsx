// Menú del módulo de Rutas, en la columna izquierda.
//
// Es el mismo patrón que usan las pantallas de ajustes de Traccar —`PageLayout` con un menú
// a la izquierda— en vez de pestañas propias. Dos razones:
//
//   - El cliente ya conoce ese lugar: ahí busca las secciones en el resto de la aplicación.
//   - `PageLayout` dibuja esa columna igual, se le pase menú o no. Sin menú era medio metro
//     de pantalla en negro; con menú, es la navegación.
import { useState, useEffect, useCallback } from 'react';
import { List, Badge } from '@mui/material';
import RouteIcon from '@mui/icons-material/Route';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useLocation } from 'react-router-dom';
import MenuItem from '../common/components/MenuItem';
import rutasApi from './api';

/// Las secciones de Rutas: las mismas en el menú de la computadora y en la fila del teléfono.
export const useSeccionesRutas = () => {
  const { pathname } = useLocation();

  // Cuántos avisos sin leer. Se vuelve a mirar cada minuto y al cambiar de sección, así el
  // número baja apenas se leen en «Avisos» sin recargar la página.
  const [noLeidas, setNoLeidas] = useState(0);
  const contar = useCallback(async () => {
    try {
      const { noLeidas: n } = await rutasApi.notificaciones({ soloNoLeidas: true, limite: 1 });
      setNoLeidas(n);
    } catch {
      // Sin el número el menú sigue sirviendo: no vale la pena mostrar un error por esto.
    }
  }, []);
  useEffect(() => {
    contar();
    const t = setInterval(contar, 60_000);
    return () => clearInterval(t);
  }, [contar, pathname]);

  return [
    {
      titulo: 'Mis rutas',
      ruta: '/rutas',
      icono: <RouteIcon />,
      elegida: pathname === '/rutas',
    },
    {
      titulo: 'Planificar',
      ruta: '/rutas/planificar',
      icono: <AddLocationAltIcon />,
      elegida: pathname === '/rutas/planificar',
    },
    {
      titulo: 'Rutas cargadas',
      ruta: '/rutas/cargadas',
      icono: <LocalShippingIcon />,
      elegida: pathname.startsWith('/rutas/cargadas'),
    },
    {
      titulo: 'Usuarios',
      ruta: '/rutas/usuarios',
      icono: <PeopleIcon />,
      elegida: pathname.startsWith('/rutas/usuarios'),
    },
    {
      titulo: 'Avisos',
      ruta: '/rutas/avisos',
      icono: <NotificationsIcon />,
      elegida: pathname === '/rutas/avisos',
      pendientes: noLeidas,
    },
  ];
};

const RutasMenu = ({ secciones }) => (
  <List>
    {secciones.map((s) => (
      <MenuItem
        key={s.ruta}
        title={s.titulo}
        link={s.ruta}
        icon={
          s.pendientes > 0 ? (
            <Badge badgeContent={s.pendientes} color="error" max={99}>
              {s.icono}
            </Badge>
          ) : (
            s.icono
          )
        }
        selected={s.elegida}
      />
    ))}
  </List>
);

export default RutasMenu;
