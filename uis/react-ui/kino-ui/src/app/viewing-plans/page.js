'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Link from 'next/link';
import {
  Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Pagination, Paper, Stack, Tab,
  Tabs, Typography,
} from '@mui/material';
import { beginLogin } from '@/app/authentication';
import { initialViewingPlanState, viewingPlanReducer } from './viewing-plan-state';

function loginRequired(response, body) {
  return (response.status === 403 && body.code === 'insufficient_scope')
    || (response.status === 401 && (
      body.code === 'authentication_required'
      || body.code === 'viewing_plan_reauthentication_required'
    ));
}

async function responseBody(response) {
  try { return await response.json(); } catch { return {}; }
}

function titleLabel(item) {
  return typeof item.title?.primaryTitle === 'string' && item.title.primaryTitle
    ? item.title.primaryTitle
    : item.plan.titleId;
}

function titleAvailability(item) {
  if (item.titleResolution === 'not_found') {
    return 'This title is no longer available in the catalog.';
  }
  if (item.titleResolution === 'unavailable') {
    return 'Title information is temporarily unavailable.';
  }
  if (!item.title?.primaryTitle) {
    return 'Title name unknown.';
  }
  return null;
}

function PlanRow({ item, pending, onComplete, onReopen, onRequestRemove }) {
  const plan = item.plan;
  const availability = titleAvailability(item);
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Box>
          <Typography component={Link} href={`/titles/${encodeURIComponent(plan.titleId)}`} variant="h6" color="primary">
            {titleLabel(item)}
          </Typography>
          <Typography variant="body2">{plan.kind === 'REWATCH' ? 'Watch again' : 'Watch'} · {plan.status.toLowerCase()}</Typography>
          {availability && <Typography variant="body2">{availability}</Typography>}
        </Box>
        <Stack direction="row" spacing={1}>
          {plan.status === 'OPEN' && <Button disabled={pending} onClick={() => onComplete(plan.id)}>Mark done</Button>}
          {plan.status === 'DONE' && <Button disabled={pending} onClick={() => onReopen(plan.id)}>Reopen</Button>}
          <Button color="error" disabled={pending} onClick={() => onRequestRemove(plan)}>Remove</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

PlanRow.propTypes = {
  item: PropTypes.shape({
    plan: PropTypes.shape({ id: PropTypes.string.isRequired, titleId: PropTypes.string.isRequired, kind: PropTypes.string.isRequired, status: PropTypes.string.isRequired }).isRequired,
    title: PropTypes.object,
    titleResolution: PropTypes.string,
  }).isRequired,
  pending: PropTypes.bool.isRequired,
  onComplete: PropTypes.func.isRequired,
  onReopen: PropTypes.func.isRequired,
  onRequestRemove: PropTypes.func.isRequired,
};

export default function ViewingPlansPage() {
  const [state, dispatch] = useReducer(viewingPlanReducer, initialViewingPlanState);
  const requestId = useRef(0);
  const reauthenticationStarted = useRef(false);
  const [planToRemove, setPlanToRemove] = useState(null);

  const load = useCallback(async (status = state.status, page = state.page, signal) => {
    const currentRequest = ++requestId.current;
    dispatch({ type: 'load', status, page, requestId: currentRequest });
    try {
      const response = await fetch(`/api/viewing-plans?status=${status}&page=${page}`, { cache: 'no-store', signal });
      const body = await responseBody(response);
      if (loginRequired(response, body)) {
        if (!reauthenticationStarted.current) {
          reauthenticationStarted.current = true;
          await beginLogin('/viewing-plans');
        }
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to load viewing plans.');
      }
      if (requestId.current === currentRequest) {
        dispatch({
          type: 'loaded',
          requestId: currentRequest,
          items: Array.isArray(body.items) ? body.items : [],
          hasNext: body.hasNext === true,
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && requestId.current === currentRequest) {
        dispatch({ type: 'error', requestId: currentRequest, error: error.message });
      }
    }
  }, [state.page, state.status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(state.status, state.page, controller.signal);
    return () => {
      requestId.current += 1;
      controller.abort();
    };
  }, [load, state.status, state.page]);

  function requestPage(status, page) {
    requestId.current += 1;
    dispatch({ type: 'load', status, page, requestId: requestId.current });
  }

  const mutate = useCallback(async (id, action) => {
    dispatch({ type: 'pending', id });
    try {
      const response = await fetch(`/api/viewing-plans/${encodeURIComponent(id)}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST', cache: 'no-store',
      });
      const body = response.status === 204 ? {} : await responseBody(response);
      if (loginRequired(response, body)) {
        await beginLogin('/viewing-plans');
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to update viewing plan.');
      }
      await load(state.status, state.page);
    } catch (error) {
      dispatch({ type: 'error', error: error.message });
    } finally {
      dispatch({ type: 'settled', id });
    }
  }, [load, state.page, state.status]);

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>Viewing plans</Typography>
      <Tabs value={state.status} onChange={(_event, status) => requestPage(status, 0)} aria-label="Viewing plan status">
        <Tab label="Open" value="OPEN" />
        <Tab label="Done" value="DONE" />
      </Tabs>
      {state.error && <Alert severity="error" sx={{ my: 2 }}>{state.error}</Alert>}
      {state.loading ? <CircularProgress aria-label="Loading viewing plans" sx={{ mt: 3 }} /> : (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {state.items.length === 0 && <Typography>No {state.status.toLowerCase()} viewing plans.</Typography>}
          {state.items.map((item) => <PlanRow key={item.plan.id} item={item} pending={Boolean(state.pending[item.plan.id])} onComplete={(id) => mutate(id, 'complete')} onReopen={(id) => mutate(id, 'reopen')} onRequestRemove={setPlanToRemove} />)}
        </Stack>
      )}
      {(state.page > 0 || state.hasNext) && <Pagination sx={{ mt: 3 }} page={state.page + 1} count={state.page + 1 + (state.hasNext ? 1 : 0)} onChange={(_event, page) => requestPage(state.status, page - 1)} />}
      <Dialog open={Boolean(planToRemove)} onClose={() => setPlanToRemove(null)}>
        <DialogTitle>Remove viewing plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the plan from your viewing history.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanToRemove(null)}>Cancel</Button>
          <Button color="error" onClick={() => {
            const id = planToRemove?.id;
            setPlanToRemove(null);
            if (id) {
              void mutate(id, 'delete');
            }
          }}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
