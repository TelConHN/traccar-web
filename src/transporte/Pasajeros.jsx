// Pasajeros («Estudiantes», «Colaboradores» o «Pasajeros» según la operación), sus grupos y
// contactos. Uno por uno o desde un Excel con plantilla.
//
// Cada persona tiene un contacto (hasta 3: la familia, el propio colaborador) y se asigna a uno
// o más horarios con la parada donde sube. Hermanos comparten contacto: un solo enlace para la
// familia con una tarjeta por cada uno.
import { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useEffectAsync } from '../reactHelper';
import { OPERACIONES } from './operaciones';
import transporteApi from './api';

const PERSONA_VACIA = { nombre: '', telefono: '', correo: '' };

const COLUMNAS = [
  'Nombre',
  'Grupo',
  'Contacto',
  'Teléfono',
  'Correo',
  'Horario',
  'Parada',
  'Latitud',
  'Longitud',
];

const Pasajeros = ({ operacion }) => {
  const op = OPERACIONES[operacion];
  const palabras = op?.pasajeros ?? { plural: 'Pasajeros', singular: 'pasajero' };

  const [pestana, setPestana] = useState(0);
  const [pasajeros, setPasajeros] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState(null);
  const [dialogoGrupo, setDialogoGrupo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [importando, setImportando] = useState(false);
  const [erroresImport, setErroresImport] = useState([]);

  const cargar = async () => {
    try {
      const [p, g, o] = await Promise.all([
        transporteApi.pasajeros(),
        transporteApi.grupos(),
        transporteApi.opcionesPasajero(),
      ]);
      setPasajeros(p);
      setGrupos(g);
      setOpciones(o);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffectAsync(cargar, []);

  const abrirNuevo = () =>
    setDialogo({
      nombre: '',
      grupoId: '',
      personas: [{ ...PERSONA_VACIA }],
      avisos: { minutosAntes: 10, llego: false, salio: false, atraso: true },
      asignaciones: [],
    });

  const abrirEditar = (p) =>
    setDialogo({
      id: p.id,
      nombre: p.nombre,
      grupoId: p.grupoId ?? '',
      contactoId: p.contactoId,
      personas: (p.contacto.personas?.length ? p.contacto.personas : [PERSONA_VACIA]).map((x) => ({
        nombre: x.nombre ?? '',
        telefono: x.telefono ?? '',
        correo: x.correo ?? '',
      })),
      avisos: {
        minutosAntes: 10,
        llego: false,
        salio: false,
        atraso: true,
        ...(p.contacto.avisos ?? {}),
      },
      asignaciones: p.asignaciones.map((a) => ({ turnoId: a.turnoId, paradaId: a.paradaId })),
    });

  const guardar = async () => {
    setGuardando(true);
    setErrorDialogo('');
    const datos = {
      nombre: dialogo.nombre.trim(),
      grupoId: dialogo.grupoId || null,
      personas: dialogo.personas
        .filter((x) => x.nombre.trim())
        .map((x) => ({
          nombre: x.nombre.trim(),
          telefono: x.telefono.trim() || null,
          correo: x.correo.trim() || null,
        })),
      avisos: dialogo.avisos,
      asignaciones: dialogo.asignaciones.filter((a) => a.turnoId && a.paradaId),
    };
    try {
      if (dialogo.id) await transporteApi.editarPasajero(dialogo.id, datos);
      else await transporteApi.crearPasajero(datos);
      setDialogo(null);
      await cargar();
    } catch (e) {
      setErrorDialogo(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarGrupo = async () => {
    setGuardando(true);
    setErrorDialogo('');
    try {
      const datos = {
        nombre: dialogoGrupo.nombre.trim(),
        correoResumen: dialogoGrupo.correoResumen.trim() || null,
      };
      if (dialogoGrupo.id) await transporteApi.editarGrupo(dialogoGrupo.id, datos);
      else await transporteApi.crearGrupo(datos);
      setDialogoGrupo(null);
      await cargar();
    } catch (e) {
      setErrorDialogo(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const accion = async (fn, mensaje) => {
    try {
      await fn();
      if (mensaje) setAviso(mensaje);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Excel ──────────────────────────────────────────────────────────────────
  const descargarPlantilla = async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet(palabras.plural);
    hoja.addRow(COLUMNAS.map((c) => (c === 'Nombre' ? `Nombre del ${palabras.singular}` : c)));
    hoja.getRow(1).font = { bold: true };
    hoja.columns.forEach((c) => {
      c.width = 24;
    });
    const ejemplo = opciones[0];
    hoja.addRow([
      'Ana López',
      grupos[0]?.nombre ?? (operacion === 'escolar' ? '4.º grado' : 'Turno mañana'),
      operacion === 'escolar' ? 'María López (mamá)' : 'Ana López',
      '9999-0000',
      'correo@ejemplo.com',
      ejemplo?.nombre ?? '06:00–07:30 · Ruta 3 · Ida',
      ejemplo?.paradas[0]?.nombre ?? 'Parada 1',
      '',
      '',
    ]);
    const ayuda = libro.addWorksheet('Cómo llenarla');
    [
      ['Nombre es obligatorio. Lo demás es opcional.'],
      ['Grupo: si no existe, se crea.'],
      ['Horario: copialo como aparece en la lista de abajo.'],
      [
        'Parada: el nombre exacto. Si no la sabés, poné Latitud y Longitud de la casa y se asigna la parada más cercana.',
      ],
      [''],
      ['Horarios disponibles:'],
      ...opciones.map((o) => [o.nombre, o.paradas.map((p) => p.nombre).join(', ')]),
    ].forEach((f) => ayuda.addRow(f));
    ayuda.getColumn(1).width = 60;
    ayuda.getColumn(2).width = 80;
    const buffer = await libro.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `plantilla-${palabras.plural.toLowerCase()}.xlsx`);
  };

  const importar = async (archivo) => {
    if (!archivo) return;
    setImportando(true);
    setErroresImport([]);
    setError('');
    try {
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(await archivo.arrayBuffer());
      const hoja = libro.worksheets[0];
      const texto = (celda) => {
        const v = celda?.value;
        if (v == null) return null;
        if (typeof v === 'object') return String(v.text ?? v.result ?? '').trim() || null;
        return String(v).trim() || null;
      };
      const numero = (celda) => {
        const t = texto(celda);
        const n = t == null ? NaN : Number(t.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      const filas = [];
      hoja.eachRow((fila, n) => {
        if (n === 1) return;
        const nombre = texto(fila.getCell(1));
        if (!nombre) return;
        filas.push({
          nombre,
          grupo: texto(fila.getCell(2)),
          contacto: texto(fila.getCell(3)),
          telefono: texto(fila.getCell(4)),
          correo: texto(fila.getCell(5)),
          horario: texto(fila.getCell(6)),
          parada: texto(fila.getCell(7)),
          latitud: numero(fila.getCell(8)),
          longitud: numero(fila.getCell(9)),
        });
      });
      if (filas.length === 0) throw new Error('La hoja no tiene filas con nombre.');
      const r = await transporteApi.importarPasajeros(filas);
      setErroresImport(r.errores);
      setAviso(
        `Se cargaron ${r.creados} de ${filas.length}.${r.errores.length ? ' Revisá las filas con error abajo.' : ''}`,
      );
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setImportando(false);
    }
  };

  const filtrados = (pasajeros ?? []).filter((p) =>
    `${p.nombre} ${p.grupo?.nombre ?? ''}`.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const opcionDe = (turnoId) => opciones.find((o) => o.id === turnoId);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 1 }}
      >
        <div>
          <Typography variant="h5" component="h1" fontWeight={600}>
            {palabras.plural}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cada {palabras.singular} con su grupo, su contacto y la parada donde sube.
          </Typography>
        </div>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button size="small" startIcon={<DownloadIcon />} onClick={descargarPlantilla}>
            Plantilla Excel
          </Button>
          <Button
            size="small"
            component="label"
            startIcon={<UploadFileIcon />}
            disabled={importando}
          >
            Importar
            <input
              hidden
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                importar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={
              pestana === 0 ? abrirNuevo : () => setDialogoGrupo({ nombre: '', correoResumen: '' })
            }
          >
            {pestana === 0 ? `Nuevo ${palabras.singular}` : 'Nuevo grupo'}
          </Button>
        </Stack>
      </Stack>

      <Tabs value={pestana} onChange={(_, v) => setPestana(v)} sx={{ mb: 1.5 }}>
        <Tab label={`${palabras.plural} · ${pasajeros?.length ?? 0}`} />
        <Tab label={`Grupos · ${grupos.length}`} />
      </Tabs>

      {(!pasajeros || importando) && !error && <LinearProgress sx={{ mb: 1 }} />}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {aviso && (
        <Alert severity="success" onClose={() => setAviso('')} sx={{ mb: 1 }}>
          {aviso}
        </Alert>
      )}
      {erroresImport.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setErroresImport([])}>
          {erroresImport.slice(0, 20).map((e) => (
            <div key={e.fila}>
              Fila {e.fila}: {e.error}
            </div>
          ))}
          {erroresImport.length > 20 && <div>… y {erroresImport.length - 20} más.</div>}
        </Alert>
      )}
      {opciones.length === 0 && pasajeros && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Todavía no hay horarios: podés cargar {palabras.plural.toLowerCase()}, pero para
          asignarles una parada primero hace falta un recorrido con horario.
        </Alert>
      )}

      {pestana === 0 && pasajeros && (
        <>
          {pasajeros.length > 5 && (
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar por nombre o grupo"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              sx={{ mb: 1 }}
            />
          )}
          {pasajeros.length === 0 ? (
            <Alert severity="info">
              Todavía no hay {palabras.plural.toLowerCase()}. Cargalos uno por uno o con la
              plantilla de Excel.
            </Alert>
          ) : (
            <List disablePadding component={Paper} variant="outlined">
              {filtrados.map((p, i) => (
                <ListItem
                  key={p.id}
                  divider={i < filtrados.length - 1}
                  secondaryAction={
                    <Stack direction="row">
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => abrirEditar(p)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Dar de baja (corta su enlace al instante)">
                        <IconButton
                          size="small"
                          onClick={() =>
                            accion(
                              () => transporteApi.borrarPasajero(p.id),
                              `${p.nombre} quedó dado de baja.`,
                            )
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={p.nombre}
                    secondary={
                      <Stack
                        direction="row"
                        spacing={0.5}
                        useFlexGap
                        flexWrap="wrap"
                        component="span"
                        sx={{ mt: 0.5, pr: 8 }}
                      >
                        {p.grupo && <Chip size="small" label={p.grupo.nombre} />}
                        {p.asignaciones.map((a) => (
                          <Chip
                            key={a.turnoId}
                            size="small"
                            variant="outlined"
                            label={`${a.turno.horaInicio} · ${a.parada.nombre}`}
                          />
                        ))}
                        {p.asignaciones.length === 0 && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label="Sin parada"
                          />
                        )}
                        {(p.contacto.personas ?? []).filter((x) => x.correo).length === 0 && (
                          <Chip size="small" variant="outlined" label="Sin correo para avisos" />
                        )}
                      </Stack>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      {pestana === 1 &&
        (grupos.length === 0 ? (
          <Alert severity="info">
            Un grupo junta a quienes siguen juntos: «4.º grado», «Maquila A · turno mañana». Con un
            enlace de grupo, la empresa o el supervisor ve todos los buses que lo atienden.
          </Alert>
        ) : (
          <List disablePadding component={Paper} variant="outlined">
            {grupos.map((g, i) => (
              <ListItem
                key={g.id}
                divider={i < grupos.length - 1}
                secondaryAction={
                  <Stack direction="row">
                    <IconButton
                      size="small"
                      onClick={() =>
                        setDialogoGrupo({
                          id: g.id,
                          nombre: g.nombre,
                          correoResumen: g.correoResumen ?? '',
                        })
                      }
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() =>
                        accion(
                          () => transporteApi.borrarGrupo(g.id),
                          `El grupo ${g.nombre} quedó dado de baja.`,
                        )
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemText
                  primary={g.nombre}
                  secondary={`${g.pasajeros} ${g.pasajeros === 1 ? palabras.singular : palabras.plural.toLowerCase()}${g.correoResumen ? ` · resumen diario a ${g.correoResumen}` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        ))}

      <Dialog open={Boolean(dialogo)} onClose={() => setDialogo(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialogo?.id ? `Editar ${palabras.singular}` : `Nuevo ${palabras.singular}`}
        </DialogTitle>
        <DialogContent>
          {dialogo && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label="Nombre"
                autoFocus
                value={dialogo.nombre}
                onChange={(e) => setDialogo({ ...dialogo, nombre: e.target.value })}
              />
              <TextField
                select
                size="small"
                label="Grupo (opcional)"
                value={dialogo.grupoId}
                onChange={(e) => setDialogo({ ...dialogo, grupoId: e.target.value })}
              >
                <MenuItem value="">Sin grupo</MenuItem>
                {grupos.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.nombre}
                  </MenuItem>
                ))}
              </TextField>

              <Divider textAlign="left">
                <Typography variant="caption">Contacto (hasta 3 personas)</Typography>
              </Divider>
              {dialogo.personas.map((x, i) => (
                <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    label="Nombre"
                    value={x.nombre}
                    onChange={(e) =>
                      setDialogo({
                        ...dialogo,
                        personas: dialogo.personas.map((y, j) =>
                          j === i ? { ...y, nombre: e.target.value } : y,
                        ),
                      })
                    }
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Teléfono"
                    value={x.telefono}
                    onChange={(e) =>
                      setDialogo({
                        ...dialogo,
                        personas: dialogo.personas.map((y, j) =>
                          j === i ? { ...y, telefono: e.target.value } : y,
                        ),
                      })
                    }
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Correo"
                    value={x.correo}
                    onChange={(e) =>
                      setDialogo({
                        ...dialogo,
                        personas: dialogo.personas.map((y, j) =>
                          j === i ? { ...y, correo: e.target.value } : y,
                        ),
                      })
                    }
                    sx={{ flex: 1.3 }}
                  />
                </Stack>
              ))}
              {dialogo.personas.length < 3 && (
                <Button
                  size="small"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    setDialogo({
                      ...dialogo,
                      personas: [...dialogo.personas, { ...PERSONA_VACIA }],
                    })
                  }
                >
                  Agregar otra persona
                </Button>
              )}

              <Divider textAlign="left">
                <Typography variant="caption">Avisos por correo</Typography>
              </Divider>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(dialogo.avisos.minutosAntes)}
                      onChange={(e) =>
                        setDialogo({
                          ...dialogo,
                          avisos: { ...dialogo.avisos, minutosAntes: e.target.checked ? 10 : null },
                        })
                      }
                    />
                  }
                  label="Cuando el bus esté a"
                />
                <TextField
                  type="number"
                  size="small"
                  disabled={!dialogo.avisos.minutosAntes}
                  value={dialogo.avisos.minutosAntes ?? 10}
                  onChange={(e) =>
                    setDialogo({
                      ...dialogo,
                      avisos: {
                        ...dialogo.avisos,
                        minutosAntes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  sx={{ width: 80 }}
                />
                <Typography variant="body2">minutos</Typography>
              </Stack>
              <Stack direction="row" useFlexGap flexWrap="wrap">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={dialogo.avisos.llego}
                      onChange={(e) =>
                        setDialogo({
                          ...dialogo,
                          avisos: { ...dialogo.avisos, llego: e.target.checked },
                        })
                      }
                    />
                  }
                  label="Llegó a la parada"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={dialogo.avisos.salio}
                      onChange={(e) =>
                        setDialogo({
                          ...dialogo,
                          avisos: { ...dialogo.avisos, salio: e.target.checked },
                        })
                      }
                    />
                  }
                  label="Salió de la parada"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={dialogo.avisos.atraso}
                      onChange={(e) =>
                        setDialogo({
                          ...dialogo,
                          avisos: { ...dialogo.avisos, atraso: e.target.checked },
                        })
                      }
                    />
                  }
                  label="Más de 15 min de atraso"
                />
              </Stack>

              <Divider textAlign="left">
                <Typography variant="caption">Horarios y parada</Typography>
              </Divider>
              {dialogo.asignaciones.map((a, i) => (
                <Stack
                  key={i}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ sm: 'center' }}
                >
                  <TextField
                    select
                    size="small"
                    label="Horario"
                    value={a.turnoId}
                    onChange={(e) =>
                      setDialogo({
                        ...dialogo,
                        asignaciones: dialogo.asignaciones.map((y, j) =>
                          j === i ? { turnoId: e.target.value, paradaId: '' } : y,
                        ),
                      })
                    }
                    sx={{ flex: 2 }}
                  >
                    {opciones.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.nombre}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Parada"
                    value={a.paradaId}
                    disabled={!a.turnoId}
                    onChange={(e) =>
                      setDialogo({
                        ...dialogo,
                        asignaciones: dialogo.asignaciones.map((y, j) =>
                          j === i ? { ...y, paradaId: e.target.value } : y,
                        ),
                      })
                    }
                    sx={{ flex: 1.5 }}
                  >
                    {(opcionDe(a.turnoId)?.paradas ?? []).map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.orden}. {p.nombre}
                      </MenuItem>
                    ))}
                  </TextField>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setDialogo({
                        ...dialogo,
                        asignaciones: dialogo.asignaciones.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                sx={{ alignSelf: 'flex-start' }}
                disabled={opciones.length === 0}
                onClick={() =>
                  setDialogo({
                    ...dialogo,
                    asignaciones: [
                      ...dialogo.asignaciones,
                      { turnoId: opciones[0]?.id ?? '', paradaId: '' },
                    ],
                  })
                }
              >
                Asignar a un horario
              </Button>
              {errorDialogo && <Alert severity="error">{errorDialogo}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogo(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={guardando || !dialogo?.nombre.trim()}
            onClick={guardar}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(dialogoGrupo)}
        onClose={() => setDialogoGrupo(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{dialogoGrupo?.id ? 'Editar grupo' : 'Nuevo grupo'}</DialogTitle>
        <DialogContent>
          {dialogoGrupo && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                size="small"
                autoFocus
                label="Nombre"
                placeholder={operacion === 'escolar' ? '4.º grado' : 'Maquila A · turno mañana'}
                value={dialogoGrupo.nombre}
                onChange={(e) => setDialogoGrupo({ ...dialogoGrupo, nombre: e.target.value })}
              />
              <TextField
                size="small"
                label="Correo para el resumen del día (opcional)"
                value={dialogoGrupo.correoResumen}
                onChange={(e) =>
                  setDialogoGrupo({ ...dialogoGrupo, correoResumen: e.target.value })
                }
              />
              {errorDialogo && <Alert severity="error">{errorDialogo}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogoGrupo(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={guardando || !dialogoGrupo?.nombre.trim()}
            onClick={guardarGrupo}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pasajeros;
