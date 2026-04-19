import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { API_HOST_URL } from '@/http/api';
import { setError } from '@/app/slice';

export const fetchTitle = createAsyncThunk(
  'title/fetchTitle',
  async ({id}, { getState, requestId, dispatch }) => {
    const { currentRequestId } = getState().title;
    
    // Prevents duplicated fetches due to fast consecutive calls
    if (requestId !== currentRequestId) {
      return;
    }

    try {
      const response = await fetch(`${API_HOST_URL}/data/title/${id}`);
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

export const fetchFacts = createAsyncThunk(
  'title/fetchFacts',
  async ({id}, { getState, requestId, dispatch }) => {
    const { currentRequestId } = getState().title;
    
    // Prevents duplicated fetches due to fast consecutive calls
    if (requestId !== currentRequestId) {
      return;
    }

    try {
      const response = await fetch(`${API_HOST_URL}/generative/title/${id}/facts`, {
        method: 'POST'
      });
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


const titleSlice = createSlice({
  name: 'title',
  initialState: { 
    status: 'idle', 
    currentRequestId: null,
    error: null,
    title: null,
    facts: null
  },
  reducers: { 
    setTitle: (state, action) => {
      state.title = action.payload;
      state.facts = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTitle.pending, (state, action) => {
        if (state.status !== 'loading') {
          state.status = 'loading';
          state.currentRequestId = action.meta.requestId;
        }
      })
      .addCase(fetchTitle.fulfilled, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'succeeded';
          state.title = action.payload;
          state.facts = null;
          state.currentRequestId = null;
        }
      })
      .addCase(fetchTitle.rejected, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'failed';
          state.error = action.error.message;
          state.currentRequestId = null;
        }
      })
      .addCase(fetchFacts.pending, (state, action) => {
        if (state.status !== 'loading') {
          state.status = 'loading';
          state.currentRequestId = action.meta.requestId;
        }
      })
      .addCase(fetchFacts.fulfilled, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'succeeded';
          state.facts = action.payload.facts;
          state.currentRequestId = null;
        }
      })
      .addCase(fetchFacts.rejected, (state, action) => {
        if (state.status === 'loading' && state.currentRequestId === action.meta.requestId) {
          state.status = 'failed';
          state.error = action.error.message;
          state.currentRequestId = null;
        }
      });
  },
});

export const { setTitle } = titleSlice.actions;

export default titleSlice.reducer;