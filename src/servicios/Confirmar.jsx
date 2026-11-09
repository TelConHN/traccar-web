// Pregunta antes de hacer algo que no se puede deshacer con un toque.
//
// Borrar un pasajero le corta el enlace a su familia al instante, y regenerar un enlace deja sin
// servicio al que ya lo tenía. Esos botones estaban al lado de los de uso diario, sin red: en un
// teléfono, un toque de más bastaba. El diálogo dice qué va a pasar, no solo «¿seguro?».
//
//   const [confirmar, dialogoConfirmar] = useConfirmar();
//   if (await confirmar({ titulo, detalle, accion: 'Borrar' })) { ... }
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

export const useConfirmar = () => {
  const [pedido, setPedido] = useState(null);
  const [abierto, setAbierto] = useState(false);

  const confirmar = (datos) =>
    new Promise((responder) => {
      setPedido({ ...datos, responder });
      setAbierto(true);
    });

  // `pedido` se queda puesto al cerrar: el texto no desaparece durante la animación de salida.
  const cerrar = (respuesta) => {
    setAbierto(false);
    pedido?.responder(respuesta);
  };

  const dialogo = (
    <Dialog open={abierto} onClose={() => cerrar(false)} fullWidth maxWidth="xs">
      <DialogTitle>{pedido?.titulo}</DialogTitle>
      <DialogContent>
        <DialogContentText>{pedido?.detalle}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => cerrar(false)}>Cancelar</Button>
        <Button
          variant="contained"
          color={pedido?.peligro === false ? 'primary' : 'error'}
          onClick={() => cerrar(true)}
        >
          {pedido?.accion}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return [confirmar, dialogo];
};
