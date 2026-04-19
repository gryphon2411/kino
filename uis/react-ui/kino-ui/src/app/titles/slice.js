import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { API_HOST_URL } from '@/http/api';
import { setError } from '@/app/slice';

export const fetchTitles = createAsyncThunk(
  'titles/fetchTitles',
  async (_, { getState, requestId, dispatch }) => {
    const { currentRequestId, page, rowsPerPage, freeText } = getState().titles;
    
    // Prevents duplicated fetches due to fast consecutive calls
    if (requestId !== currentRequestId) {
      return;
    }

    try {
      // Build URL with optional freeText parameter
      let url = `${API_HOST_URL}/data/titles?page=${page}&size=${rowsPerPage}`;
      if (freeText) {
        url += `&freeText=${encodeURIComponent(freeText)}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    } catch (error) {
      dispatch(setError(error.message));

      throw error;
    }
  }
);

const titlesSlice = createSlice({
  name: 'titles',
  initialState: { 
    status: 'idle', 
    currentRequestId: null,
    error: null,
    content: [],
    page: 0,
    rowsPerPage: 10,
    view: 'table',
    freeText: ''
  },
  reducers: {
    setFreeText: (state, action) => {
      state.freeText = action.payload;
      state.content = []; // Clear content to prepare for new results
      state.page = 0;     // Reset to first page
    },
    setPage: (state, action) => {
      state.page = action.payload;
    },
    setRowsPerPage: (state, action) => {
      state.content = [];
      state.page = 0;
      state.rowsPerPage = action.payload;
    },
    setView: (state, action) => {
      state.content = [];
      state.page = 0;
      if (action.payload === 'table') {
        state.rowsPerPage = 10;
      } else if (action.payload == 'grid') {
        state.rowsPerPage = 50;
      }
      state.view = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTitles.pending, (state, action) => {
        if (state.status !== 'loading') {
          state.status = 'loading';
          state.currentRequestId = action.meta.requestId;
        }
      })
      .addCase(fetchTitles.fulfilled, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'succeeded';
          state.content = [...state.content, ...action.payload.content];
          state.currentRequestId = null;
        }
      })
      .addCase(fetchTitles.rejected, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'failed';
          state.error = action.error.message;
          state.currentRequestId = null;
        }
      });
  },
});

export const { setPage, setRowsPerPage, setView, setFreeText } = titlesSlice.actions;

export default titlesSlice.reducer;