import { createSlice } from '@reduxjs/toolkit';

const { reducer, actions } = createSlice({
  name: 'events',
  initialState: {
    items: [],
  },
  reducers: {
    // Los guardados en el navegador al volver a abrir la página (ver SocketController).
    load(state, action) {
      const seen = new Set();
      state.items = action.payload
        .filter((item) => !seen.has(item.id) && seen.add(item.id))
        .slice(0, 50);
    },
    add(state, action) {
      state.items.unshift(...action.payload);
      state.items.splice(50);
    },
    delete(state, action) {
      state.items = state.items.filter((item) => item.id !== action.payload.id);
    },
    deleteAll(state) {
      state.items = [];
    },
  },
});

export { actions as eventsActions };
export { reducer as eventsReducer };
