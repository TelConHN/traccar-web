// «Ver introducción» en el mapa principal: un botón chico, siempre a mano, que vuelve a abrir la
// explicación paso a paso.
//
// Va flotando y no en una franja como en Rutas y Transporte porque el mapa ocupa toda la pantalla
// y no hay una barra donde ponerlo sin quitarle mapa a quien ya sabe usarlo.
import { Fab, Tooltip } from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';

const BotonIntroduccion = ({ onAbrir }) => (
  <Tooltip title="Ver introducción" placement="left">
    <Fab
      size="small"
      color="primary"
      onClick={onAbrir}
      sx={{
        position: 'absolute',
        // Debajo de los controles del mapa (zoom, capas), del lado derecho.
        top: (theme) => theme.spacing(28),
        right: (theme) => theme.spacing(1.5),
        zIndex: 3,
      }}
    >
      <SchoolOutlinedIcon fontSize="small" />
    </Fab>
  </Tooltip>
);

export default BotonIntroduccion;
