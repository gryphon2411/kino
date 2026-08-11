export const initialViewingPlanState = {
  status: 'OPEN',
  page: 0,
  loading: true,
  error: null,
  items: [],
  hasNext: false,
  pending: {},
  requestId: 0,
};

export function viewingPlanReducer(state, action) {
  switch (action.type) {
    case 'load':
      return {
        ...state,
        loading: true,
        error: null,
        status: action.status,
        page: action.page,
        requestId: action.requestId ?? state.requestId,
      };
    case 'loaded':
      if (action.requestId !== undefined && action.requestId !== state.requestId) {
        return state;
      }
      return { ...state, loading: false, items: action.items, hasNext: action.hasNext };
    case 'error':
      if (action.requestId !== undefined && action.requestId !== state.requestId) {
        return state;
      }
      return { ...state, loading: false, error: action.error, items: [] };
    case 'pending':
      return { ...state, pending: { ...state.pending, [action.id]: true } };
    case 'settled': {
      const pending = { ...state.pending };
      delete pending[action.id];
      return { ...state, pending };
    }
    default:
      return state;
  }
}
