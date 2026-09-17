// Compartir seguimiento: los tres tipos de enlace (TRANSPORTE.md §1b).
//
//   Personal  — una familia, un colaborador, un pasajero: su bus, en horario, su parada.
//   De grupo  — la empresa atendida o el supervisor: los buses de su grupo, sin paradas privadas.
//   Recorrido — público: para redes o un QR en la parada. Solo si ninguna parada es privada.
//
// El código se ve UNA vez, al crear o regenerar: el servidor guarda solo su hash. Por eso la
// pantalla lo muestra en un diálogo con WhatsApp, copiar y QR para imprimir, y avisa que después
// no se puede volver a ver (se regenera).
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import { useEffectAsync } from '../reactHelper';
import { OPERACIONES } from './operaciones';
import transporteApi from './api';

const CLASE = {
  personal: 'Personal',
  grupo: 'De grupo',
  recorrido: 'Recorrido público',
};

const fecha = (d) =>
  new Date(d).toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' });

/// El mensaje de WhatsApp, con las palabras de la operación.
const mensaje = (operacion, clase, etiqueta, url) => {
  if (clase === 'recorrido') return `Seguí en vivo el bus de ${etiqueta}: ${url}`;
  if (clase === 'grupo')
    return `Este enlace muestra en vivo los buses que atienden a ${etiqueta}, en su horario: ${url}`;
  if (operacion === 'escolar')
    return `Hola. Con este enlace ves en vivo el bus de ${etiqueta} mientras va en ruta, y cuánto falta para su parada: ${url}`;
  return `Hola. Con este enlace ves en vivo tu bus mientras va en ruta y cuánto falta para tu parada: ${url}`;
};

const Compartir = ({ operacion }) => {
  const op = OPERACIONES[operacion];
  const hayPasajeros = Boolean(op?.pasajeros);
  const [enlaces, setEnlaces] = useState(null);
  const [pasajeros, setPasajeros] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(null);
  const [recienCreado, setRecienCreado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const [e, l] = await Promise.all([transporteApi.enlaces(), transporteApi.lineas()]);
      setEnlaces(e);
      setLineas(l);
      if (hayPasajeros) {
        const [p, g] = await Promise.all([transporteApi.pasajeros(), transporteApi.grupos()]);
        setPasajeros(p);
        setGrupos(g);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  useEffectAsync(cargar, []);

  // Un contacto por fila: los hermanos comparten enlace.
  const contactos = [...new Map(pasajeros.map((p) => [p.contactoId, p])).values()].map((p) => ({
    id: p.contactoId,
    nombre: pasajeros
      .filter((x) => x.contactoId === p.contactoId)
      .map((x) => x.nombre)
      .join(', '),
  }));
  const variantes = lineas.flatMap((l) =>
    l.variantes.map((v) => ({ id: v.id, nombre: `${l.nombre} · ${v.nombre}` })),
  );

  const crear = async () => {
    setGuardando(true);
    setError('');
    try {
      const datos = { clase: nuevo.clase };
      if (nuevo.clase === 'personal') datos.contactoId = nuevo.destino;
      if (nuevo.clase === 'grupo') datos.grupoId = nuevo.destino;
      if (nuevo.clase === 'recorrido') datos.varianteId = nuevo.destino;
      if (nuevo.venceEn) datos.venceEn = nuevo.venceEn;
      const e = await transporteApi.crearEnlace(datos);
      setNuevo(null);
      setRecienCreado(e);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const regenerar = async (id) => {
    try {
      setRecienCreado(await transporteApi.regenerarEnlace(id));
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const revocar = async (id) => {
    try {
      await transporteApi.revocarEnlace(id);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const url = recienCreado ? `${window.location.origin}/seguir/${recienCreado.codigo}` : '';
  const opcionesDestino = !nuevo
    ? []
    : nuevo.clase === 'personal'
      ? contactos
      : nuevo.clase === 'grupo'
        ? grupos
        : variantes;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2 }}
      >
        <div>
          <Typography variant="h5" component="h1" fontWeight={600}>
            Compartir seguimiento
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enlaces para ver el bus sin usuario ni contraseña. Cada uno muestra solo lo suyo, y solo
            en horario de ruta.
          </Typography>
        </div>
        <Button
          variant="contained"
          onClick={() =>
            setNuevo({ clase: hayPasajeros ? 'personal' : 'recorrido', destino: '', venceEn: '' })
          }
        >
          Nuevo enlace
        </Button>
      </Stack>

      {!enlaces && !error && <LinearProgress />}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {enlaces && enlaces.length === 0 && (
        <Alert severity="info">
          {hayPasajeros
            ? `Todavía no compartiste ningún enlace. Creá uno por ${op.pasajeros.singular} (o por familia) y mandalo por WhatsApp.`
            : 'Todavía no publicaste ningún recorrido. Creá un enlace y pegalo en tus redes o imprimí el QR para las paradas.'}
        </Alert>
      )}

      {enlaces && enlaces.length > 0 && (
        <List disablePadding component={Paper} variant="outlined">
          {enlaces.map((e, i) => (
            <ListItem key={e.id} divider={i < enlaces.length - 1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <ListItemText
                primary={e.etiqueta}
                secondary={`${CLASE[e.clase]} · ${e.vigente ? `vence el ${fecha(e.venceEn)}` : e.revocadoEn ? 'revocado' : 'no vigente'} · ${e.usos} ${e.usos === 1 ? 'visita' : 'visitas'}${e.ultimoUsoEn ? `, última el ${fecha(e.ultimoUsoEn)}` : ''}`}
                sx={{ minWidth: 220 }}
              />
              <Stack direction="row" spacing={1}>
                <Chip
                  size="small"
                  color={e.vigente ? 'success' : 'default'}
                  label={e.vigente ? 'Vigente' : 'No vigente'}
                />
                <Button size="small" onClick={() => regenerar(e.id)}>
                  {e.vigente ? 'Regenerar' : 'Reactivar'}
                </Button>
                {e.vigente && (
                  <Button size="small" color="error" onClick={() => revocar(e.id)}>
                    Revocar
                  </Button>
                )}
              </Stack>
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={Boolean(nuevo)} onClose={() => setNuevo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Nuevo enlace</DialogTitle>
        <DialogContent>
          {nuevo && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={nuevo.clase}
                onChange={(_, v) => v && setNuevo({ ...nuevo, clase: v, destino: '' })}
              >
                {hayPasajeros && <ToggleButton value="personal">Personal</ToggleButton>}
                {hayPasajeros && <ToggleButton value="grupo">De grupo</ToggleButton>}
                <ToggleButton value="recorrido">Recorrido público</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary">
                {nuevo.clase === 'personal' &&
                  'Su bus en vivo mientras hace su recorrido (y 15 min antes), su parada y cuántos minutos faltan. Nada más.'}
                {nuevo.clase === 'grupo' &&
                  'Todos los buses que atienden a ese grupo, en su horario. Nunca muestra paradas privadas.'}
                {nuevo.clase === 'recorrido' &&
                  'Cualquiera con el enlace ve los buses de ese recorrido y cuánto falta a cada parada. Solo se puede si ninguna parada es privada.'}
              </Typography>
              <TextField
                select
                size="small"
                label={
                  nuevo.clase === 'personal'
                    ? `Para quién`
                    : nuevo.clase === 'grupo'
                      ? 'Grupo'
                      : 'Recorrido'
                }
                value={nuevo.destino}
                onChange={(e) => setNuevo({ ...nuevo, destino: e.target.value })}
              >
                {opcionesDestino.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.nombre}
                  </MenuItem>
                ))}
              </TextField>
              {opcionesDestino.length === 0 && (
                <Alert severity="info">
                  {nuevo.clase === 'personal' &&
                    `Primero cargá ${op?.pasajeros?.plural.toLowerCase() ?? 'pasajeros'}.`}
                  {nuevo.clase === 'grupo' && 'Primero creá un grupo.'}
                  {nuevo.clase === 'recorrido' && 'Primero grabá un recorrido.'}
                </Alert>
              )}
              <TextField
                type="date"
                size="small"
                label="Vence (vacío = lo normal para tu tipo de transporte)"
                value={nuevo.venceEn}
                onChange={(e) => setNuevo({ ...nuevo, venceEn: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNuevo(null)}>Cancelar</Button>
          <Button variant="contained" disabled={guardando || !nuevo?.destino} onClick={crear}>
            Crear enlace
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(recienCreado)}
        onClose={() => setRecienCreado(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Enlace listo</DialogTitle>
        <DialogContent>
          {recienCreado && (
            <Stack spacing={1.5} alignItems="center" className="imprimible">
              <Typography fontWeight={600} textAlign="center">
                {recienCreado.etiqueta}
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1 }}>
                <QRCodeSVG value={url} size={200} includeMargin />
              </Box>
              <TextField
                size="small"
                fullWidth
                value={url}
                slotProps={{ htmlInput: { readOnly: true } }}
                onFocus={(e) => e.target.select()}
              />
              <Alert severity="warning" sx={{ width: '100%' }}>
                Guardalo o mandalo ahora: por seguridad no se puede volver a ver. Si se pierde, se
                regenera y el anterior deja de funcionar.
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button
            startIcon={<ContentCopyIcon />}
            onClick={() => navigator.clipboard?.writeText(url)}
          >
            Copiar
          </Button>
          <Button
            startIcon={<WhatsAppIcon />}
            href={`https://wa.me/?text=${encodeURIComponent(mensaje(operacion, recienCreado?.clase, recienCreado?.etiqueta, url))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </Button>
          <Button startIcon={<PrintIcon />} onClick={() => window.print()}>
            Imprimir QR
          </Button>
          <Button variant="contained" onClick={() => setRecienCreado(null)}>
            Listo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Compartir;
