import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import CloseIcon from '@mui/icons-material/Close';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import PanToolIcon from '@mui/icons-material/PanTool';
import RouterIcon from '@mui/icons-material/Router';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAdministrator } from '../../common/util/permissions';

// «Cómo funcionan los productos», para nosotros (administradores). El cliente no ve el botón: él solo
// carga sus productos. Es una ventana que se abre a pedido y no deja nada en la pantalla al cerrarla:
// la explicación con texto corrido no se leía, y plegada en el formulario igual ocupaba lugar.

// Las fichas que dicen en qué quedó el producto se ven rellenas; los pasos, solo con borde.
const ESTADOS = ['Cargado', 'Descargado'];

const Paso = ({ icono, titulo, detalle }) => (
  <Stack alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 120, textAlign: 'center' }}>
    <Box
      sx={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
        color: 'primary.main',
      }}
    >
      {icono}
    </Box>
    <Typography variant="body2" fontWeight={600}>
      {titulo}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {detalle}
    </Typography>
  </Stack>
);

const Flecha = ({ telefono }) => (
  <ArrowForwardIcon
    aria-hidden
    color="disabled"
    sx={{ alignSelf: 'center', transform: telefono ? 'rotate(90deg)' : 'none' }}
  />
);

const Forma = ({ icono, titulo, equipo, regla }) => (
  <Box
    sx={{
      flex: '1 1 220px',
      minWidth: 0,
      p: 2,
      border: 1,
      borderColor: 'divider',
      borderRadius: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}
  >
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icono}</Box>
      <Typography fontWeight={600}>{titulo}</Typography>
    </Stack>
    <Typography variant="caption" color="text.secondary">
      {equipo}
    </Typography>
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
      {regla.map((parte, i) =>
        parte === '→' ? (
          <ArrowForwardIcon key={`f${i}`} fontSize="small" color="disabled" aria-hidden />
        ) : (
          <Chip
            key={parte}
            size="small"
            label={parte}
            variant={ESTADOS.includes(parte) ? 'filled' : 'outlined'}
          />
        ),
      )}
    </Stack>
  </Box>
);

const ProductosAyuda = ({ sx }) => {
  const administrator = useAdministrator();
  const theme = useTheme();
  const telefono = useMediaQuery(theme.breakpoints.down('sm'));
  const [abierta, setAbierta] = useState(false);

  if (!administrator) return null;

  return (
    <Box sx={sx}>
      <Button size="small" startIcon={<HelpOutlineIcon />} onClick={() => setAbierta(true)}>
        Cómo funciona
      </Button>
      <Dialog
        open={abierta}
        onClose={() => setAbierta(false)}
        fullScreen={telefono}
        maxWidth="md"
        fullWidth
        aria-labelledby="productos-ayuda-titulo"
      >
        <DialogTitle id="productos-ayuda-titulo" sx={{ pr: 6 }}>
          Cómo funcionan los productos
          <Typography variant="caption" color="text.secondary" display="block">
            Solo lo ven los administradores
          </Typography>
          <IconButton
            aria-label="Cerrar"
            onClick={() => setAbierta(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Igual que el conductor por tarjeta
              </Typography>
              <Stack
                direction={telefono ? 'column' : 'row'}
                spacing={1}
                alignItems="stretch"
                sx={{ mt: 1 }}
              >
                <Paso
                  icono={<QrCodeScannerIcon />}
                  titulo="Lector"
                  detalle="Lee la etiqueta del producto"
                />
                <Flecha telefono={telefono} />
                <Paso
                  icono={<RouterIcon />}
                  titulo="GPS"
                  detalle="Manda el código con su posición"
                />
                <Flecha telefono={telefono} />
                <Paso
                  icono={<Inventory2Icon />}
                  titulo="Traccar"
                  detalle="Busca el código en Ajustes → Productos"
                />
                <Flecha telefono={telefono} />
                <Paso
                  icono={<LocalShippingIcon />}
                  titulo="Vehículo"
                  detalle="«Lleva 12 productos» en la tarjeta del mapa"
                />
              </Stack>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Tres formas de cargar un producto
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1.5} sx={{ mt: 1 }}>
                <Forma
                  icono={<QrCodeScannerIcon />}
                  titulo="Lector que se pasa"
                  equipo="Código de barras o segundo RFID"
                  regla={['Leer', '→', 'Cargado', '→', 'Leer otra vez', '→', 'Descargado']}
                />
                <Forma
                  icono={<BluetoothIcon />}
                  titulo="Etiqueta Bluetooth"
                  equipo="Pegada al producto; GPS con Bluetooth"
                  regla={[
                    'El GPS la ve',
                    '→',
                    'Cargado',
                    '→',
                    '5 min sin verla',
                    '→',
                    'Descargado',
                  ]}
                />
                <Forma
                  icono={<PanToolIcon />}
                  titulo="A mano"
                  equipo="Vehículos sin lector"
                  regla={['Dispositivo', '→', 'Conexiones', '→', 'Productos']}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                La carga queda guardada en cada posición: sigue igual aunque se reinicie el servidor
                y se ve en el historial.
              </Typography>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Para el técnico
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Atributo del dispositivo</TableCell>
                      <TableCell>Para qué</TableCell>
                      <TableCell>Si no se pone</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        processing.productAttributes
                      </TableCell>
                      <TableCell>Qué entrada del GPS trae el código</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>barcode,io207</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        processing.productTagTimeout
                      </TableCell>
                      <TableCell>Segundos sin ver una etiqueta para descargarla</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>300</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}
              >
                <WarningAmberIcon color="warning" fontSize="small" sx={{ mt: 0.25 }} />
                <Typography variant="body2">
                  La entrada del conductor (<code>driverUniqueId</code>) nunca se usa para
                  productos. Si el lector repite el mismo código en cada reporte, cuenta una sola
                  vez: configurar esa entrada del GPS para que mande solo al cambiar.
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ProductosAyuda;
