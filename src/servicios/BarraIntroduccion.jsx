// La franja de arriba de Rutas y Transporte: «Ver introducción» siempre a mano y, en una demo
// simulada, el aviso de que los vehículos se mueven solos (para que nadie la confunda con su flota
// real ni crea que un desvío de la demo es de verdad).
import { Alert, Button, Stack, useMediaQuery } from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';

const BarraIntroduccion = ({ demo, onAbrir }) => {
  const telefono = useMediaQuery((theme) => theme.breakpoints.down('md'));
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="flex-end"
      spacing={1}
      sx={{ px: 2, pt: 1, pb: { xs: 1, md: 0 }, flexShrink: 0 }}
    >
      {demo && (
        <Alert
          severity="info"
          icon={telefono ? false : undefined}
          sx={{ py: 0, px: { xs: 1, md: 2 }, flexGrow: 1, minWidth: 0 }}
        >
          {telefono
            ? 'Demo simulada: los vehículos se mueven solos.'
            : 'Demo simulada: los vehículos se mueven solos y los datos se pueden reiniciar.'}
        </Alert>
      )}
      <Button size="small" startIcon={<SchoolOutlinedIcon />} onClick={onAbrir}>
        {telefono ? 'Introducción' : 'Ver introducción'}
      </Button>
    </Stack>
  );
};

export default BarraIntroduccion;
