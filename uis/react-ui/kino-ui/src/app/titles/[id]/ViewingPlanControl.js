'use client';

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { beginLogin } from '@/app/authentication';

function shouldLogin(response, body) {
  return (response.status === 403 && body.code === 'insufficient_scope')
    || (response.status === 401 && (
      body.code === 'authentication_required'
      || body.code === 'viewing_plan_reauthentication_required'
    ));
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function ViewingPlanControl({ titleId }) {
  const [enabled, setEnabled] = useState(false);
  const [plan, setPlan] = useState(undefined);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    async function load() {
      setError(null);
      setPlan(undefined);
      try {
        const statusResponse = await fetch('/api/viewing-plans/status', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const status = await responseBody(statusResponse);
        if (requestId.current !== currentRequest || !statusResponse.ok || status.enabled !== true) {
          setEnabled(false);
          return;
        }
        setEnabled(true);
        const response = await fetch(`/api/viewing-plans/titles/${encodeURIComponent(titleId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await responseBody(response);
        if (requestId.current !== currentRequest) {
          return;
        }
        if (shouldLogin(response, body)) {
          await beginLogin(`/titles/${encodeURIComponent(titleId)}`);
          return;
        }
        if (!response.ok) {
          throw new Error(body.error || 'Unable to load this viewing plan.');
        }
        setPlan(body.plan || null);
      } catch (loadError) {
        if (loadError.name !== 'AbortError' && requestId.current === currentRequest) {
          setError(loadError.message);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [titleId]);

  async function create(kind) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/viewing-plans/titles/${encodeURIComponent(titleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
        cache: 'no-store',
      });
      const body = await responseBody(response);
      if (shouldLogin(response, body)) {
        await beginLogin(`/titles/${encodeURIComponent(titleId)}`);
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to save the viewing plan.');
      }
      setPlan(body.plan);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!plan) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/viewing-plans/${encodeURIComponent(plan.id)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      const body = response.status === 204 ? {} : await responseBody(response);
      if (shouldLogin(response, body)) {
        await beginLogin(`/titles/${encodeURIComponent(titleId)}`);
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Unable to remove the viewing plan.');
      }
      setPlan(null);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setPending(false);
    }
  }

  if (!enabled) {
    return null;
  }
  if (plan === undefined) {
    return <CircularProgress size={24} sx={{ my: 2 }} aria-label="Loading viewing plan" />;
  }
  if (plan) {
    return (
      <Box sx={{ my: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ mb: 1 }}>Planned: {plan.kind === 'REWATCH' ? 'Watch again' : 'Watch'}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button disabled={pending} onClick={() => create('WATCH')}>Plan to watch</Button>
          <Button disabled={pending} onClick={() => create('REWATCH')}>Plan to rewatch</Button>
          <Button color="error" disabled={pending} onClick={remove}>Remove</Button>
          <Button component={Link} href="/viewing-plans" variant="outlined">View plans</Button>
        </Stack>
      </Box>
    );
  }
  return (
    <Box sx={{ my: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" disabled={pending} onClick={() => create('WATCH')}>Plan to watch</Button>
        <Button variant="outlined" disabled={pending} onClick={() => create('REWATCH')}>Plan to rewatch</Button>
      </Stack>
    </Box>
  );
}

ViewingPlanControl.propTypes = {
  titleId: PropTypes.string.isRequired,
};
