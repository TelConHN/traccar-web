import { Box, Button, Typography } from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './LocalizationProvider';
import useCarga from '../util/useCarga';

// En la tarjeta del vehículo, solo el resumen de lo que lleva: cuántos y los 3 primeros. La lista
// completa (pueden ser decenas) se abre en su propia pantalla con «Ver carga». Si no lleva nada, no
// ocupa lugar: la tarjeta de los vehículos sin productos queda igual que antes.
const CargaResumen = ({ deviceId }) => {
  const t = useTranslation();
  const navigate = useNavigate();
  const { productos } = useCarga(deviceId);

  if (productos.length === 0) return null;

  const nombres = productos.map((p) => p.nombre ?? p.codigo);
  const primeros = nombres.slice(0, 3).join(', ');
  const resto = nombres.length - 3;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pt: 1,
        mt: 1,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Inventory2Icon fontSize="small" color="action" aria-hidden />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {`${t('productCarrying')} ${productos.length} ${t('sharedProducts').toLowerCase()}`}
        </Typography>
        {/* Hasta dos renglones y sin «…»: en el teléfono no hay cómo leer lo cortado. Son 3 nombres
            como mucho; el resto queda en «y N más». */}
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ overflowWrap: 'anywhere' }}
        >
          {resto > 0 ? `${primeros} y ${resto} más` : primeros}
        </Typography>
      </Box>
      <Button size="small" onClick={() => navigate(`/carga/${deviceId}`)} sx={{ flexShrink: 0 }}>
        {t('productViewLoad')}
      </Button>
    </Box>
  );
};

export default CargaResumen;
