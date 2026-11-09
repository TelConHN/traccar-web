import { createSlice } from '@reduxjs/toolkit';

// Catálogo de productos, por código: lo mismo que el de conductores. Sirve para mostrar el nombre en
// vez del código que manda el lector.
const { reducer, actions } = createSlice({
  name: 'products',
  initialState: {
    items: {},
  },
  reducers: {
    refresh(state, action) {
      state.items = {};
      action.payload.forEach((item) => (state.items[item.uniqueId] = item));
    },
  },
});

export { actions as productsActions };
export { reducer as productsReducer };
