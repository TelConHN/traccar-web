// Alta de un conductor o un encargado.
//
// Vive en su propio archivo porque se usa desde dos lugares: al planificar —cuando hace falta
// un conductor y no está creado— y desde la pestaña Usuarios, que es donde uno lo busca.
// Tenerlo duplicado garantizaba que tarde o temprano los dos formularios pidieran cosas
// distintas.
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import rutasApi from './api';

// El horario por defecto es el de una jornada normal en Honduras. Se puede borrar: sin
// horario, el planificador no avisa nada — es un dato opcional, no una obligación nueva.
const VACIO = {
  nombre: '',
  correo: '',
  password: '',
  rol: 'conductor',
  entra: '07:00',
  sale: '17:00',
};

const NuevoUsuarioDialog = ({ open, onClose, onCreado, usuario }) => {
  const editando = Boolean(usuario);
  const [form, setForm] = useState(VACIO);

  // Al abrir con un usuario, el formulario arranca con sus datos. La contraseña queda vacía
  // a propósito: no se puede leer la que tiene, y dejarla vacía significa «no la cambies».
  useEffect(() => {
    if (open) {
      setForm(
        usuario
          ? {
              nombre: usuario.nombre ?? '',
              correo: usuario.correo ?? '',
              password: '',
              rol: usuario.rol ?? 'conductor',
              entra: usuario.entra ?? '',
              sale: usuario.sale ?? '',
            }
          : VACIO,
      );
      setError('');
    }
  }, [open, usuario]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cerrar = () => {
    setForm(VACIO);
    setError('');
    onClose();
  };

  const crear = async () => {
    setOcupado(true);
    try {
      const creado = editando
        ? await rutasApi.editarConductor(usuario.id, {
            nombre: form.nombre.trim(),
            rol: form.rol,
            entra: form.rol === 'conductor' ? form.entra : '',
            sale: form.rol === 'conductor' ? form.sale : '',
            // Solo viaja si se escribió una nueva: el servidor la ignora si no viene.
            ...(form.password ? { password: form.password } : {}),
          })
        : await rutasApi.crearConductor({
            nombre: form.nombre.trim(),
            correo: form.correo.trim(),
            password: form.password,
            rol: form.rol,
            // Al encargado no se le pregunta: no maneja, así que un horario suyo no cambiaría
            // ninguna advertencia del planificador.
            ...(form.rol === 'conductor' ? { entra: form.entra, sale: form.sale } : {}),
          });
      const rol = form.rol;
      setForm(VACIO);
      setError('');
      onClose();
      await onCreado?.(creado, rol);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const listo =
    !ocupado &&
    form.nombre.trim() &&
    (editando
      ? form.password === '' || form.password.length >= 8
      : form.correo.trim() && form.password.length >= 8);

  return (
    <Dialog open={open} onClose={cerrar} fullWidth maxWidth="xs">
      <DialogTitle>{editando ? 'Editar usuario' : 'Usuario nuevo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <ToggleButtonGroup
            exclusive
            size="small"
            fullWidth
            value={form.rol}
            onChange={(_e, v) => v && setForm({ ...form, rol: v })}
          >
            <ToggleButton value="conductor">Conductor</ToggleButton>
            <ToggleButton value="encargado">Encargado</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary">
            {form.rol === 'encargado'
              ? 'Arma rutas y ve el avance de tus vehículos, igual que vos.'
              : 'Entra desde su teléfono y ve solo la ruta que le asignes, con sus paradas y sus entregas.'}
          </Typography>
          <TextField
            label="Nombre"
            size="small"
            fullWidth
            autoFocus
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          />
          <TextField
            label="Correo con el que entra"
            size="small"
            fullWidth
            disabled={editando}
            value={form.correo}
            onChange={(e) => setForm({ ...form, correo: e.target.value })}
            helperText={editando ? 'El correo no se cambia: es con lo que entra.' : ''}
          />
          {/* Su horario de trabajo. Con esto el planificador avisa antes de despachar cuando
              una ruta —o la suma de las rutas anidadas— termina después de que salga, y el
              cliente puede ver cuánto tiempo fuera de horario lleva. */}
          {form.rol === 'conductor' && (
            <Stack direction="row" spacing={1}>
              <TextField
                label="Entra"
                type="time"
                size="small"
                fullWidth
                value={form.entra}
                onChange={(e) => setForm({ ...form, entra: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Sale"
                type="time"
                size="small"
                fullWidth
                value={form.sale}
                onChange={(e) => setForm({ ...form, sale: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          )}
          {form.rol === 'conductor' && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              Su horario de trabajo. Sirve para avisar cuando una ruta se le pasa de la hora. Dejalo
              vacío si no querés que el sistema lo controle.
            </Typography>
          )}
          <TextField
            label="Contraseña"
            size="small"
            fullWidth
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText={
              editando
                ? 'Dejala vacía para no cambiarla.'
                : 'Mínimo 8 caracteres. Se la pasás vos a tu gente.'
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={cerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!listo} onClick={crear}>
          {editando ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NuevoUsuarioDialog;
