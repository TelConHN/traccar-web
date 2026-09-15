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

const RutasMenu = () => {
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

  return (
    <List>
      <MenuItem
        title="Mis rutas"
        link="/rutas"
        icon={<RouteIcon />}
        selected={pathname === '/rutas'}
      />
      <MenuItem
        title="Planificar"
        link="/rutas/planificar"
        icon={<AddLocationAltIcon />}
        selected={pathname === '/rutas/planificar'}
      />
      <MenuItem
        title="Rutas cargadas"
        link="/rutas/cargadas"
        icon={<LocalShippingIcon />}
        selected={pathname.startsWith('/rutas/cargadas')}
      />
      <MenuItem
        title="Usuarios"
        link="/rutas/usuarios"
        icon={<PeopleIcon />}
        selected={pathname === '/rutas/usuarios'}
      />
      <MenuItem
        title="Avisos"
        link="/rutas/avisos"
        icon={
          <Badge badgeContent={noLeidas} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        }
        selected={pathname === '/rutas/avisos'}
      />
    </List>
  );
};

export default RutasMenu;
