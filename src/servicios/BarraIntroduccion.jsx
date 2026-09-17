// La franja de arriba de Rutas y Transporte: «Ver introducción» siempre a mano y, en una demo
// simulada, el aviso de que los vehículos se mueven solos (para que nadie la confunda con su flota
// real ni crea que un desvío de la demo es de verdad).
import { Alert, Button, Stack } from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';

const BarraIntroduccion = ({ demo, onAbrir }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="flex-end"
    spacing={1}
    sx={{ px: { xs: 1, md: 2 }, pt: 1, flexWrap: 'wrap', rowGap: 1 }}
  >
    {demo && (
      <Alert severity="info" sx={{ py: 0, flexGrow: 1 }}>
        Demo simulada: los vehículos se mueven solos y los datos se pueden reiniciar.
      </Alert>
    )}
    <Button size="small" startIcon={<SchoolOutlinedIcon />} onClick={onAbrir}>
      Ver introducción
    </Button>
  </Stack>
);

export default BarraIntroduccion;
