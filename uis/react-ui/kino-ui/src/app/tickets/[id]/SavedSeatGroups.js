'use client';

import PropTypes from 'prop-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { seatPresetCompatibility } from './seat-preset-compatibility';
import { ticketResponseBody } from './ticket-response';

function ticketErrorMessage(body, fallback) {
  if (body.error === 'preset_name_taken') {
    return 'You already have a saved seat group with that name.';
  }
  if (body.error === 'invalid_preset_name') {
    return 'Choose a saved seat group name between one and 40 characters.';
  }
  if (body.error === 'invalid_seat_codes') {
    return 'Choose between one and eight supported seats.';
  }
  return fallback;
}

export default function SavedSeatGroups({
  actionsDisabled,
  onReplaceSelection,
  reauthenticateIfNeeded,
  seats,
  selectedSeatCodes,
}) {
  const [seatPresets, setSeatPresets] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const loadRequestId = useRef(0);

  const loadSeatPresets = useCallback(async (signal) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tickets/seat-presets', {
        cache: 'no-store',
        signal,
      });
      const body = await ticketResponseBody(response);
      if (await reauthenticateIfNeeded(response, body)) {
        return;
      }
      if (!response.ok) {
        throw new Error(ticketErrorMessage(body, 'Unable to load saved seat groups.'));
      }
      if (loadRequestId.current !== requestId) {
        return;
      }
      setSeatPresets(Array.isArray(body.seatPresets) ? body.seatPresets : []);
    } catch (loadError) {
      if (loadError.name === 'AbortError' || loadRequestId.current !== requestId) {
        return;
      }
      setError(loadError.message);
    } finally {
      if (loadRequestId.current === requestId) {
        setLoading(false);
      }
    }
  }, [reauthenticateIfNeeded]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSeatPresets(controller.signal);
    return () => {
      loadRequestId.current += 1;
      controller.abort();
    };
  }, [loadSeatPresets]);

  const normalizedName = name.trim();
  const actionDisabled = actionsDisabled || loading || requesting;
  const canSave = !actionDisabled
    && normalizedName.length > 0
    && selectedSeatCodes.length > 0;

  async function saveCurrentSelection() {
    if (!canSave) {
      return;
    }
    const seatCodes = [...selectedSeatCodes];
    setRequesting(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch('/api/tickets/seat-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, seatCodes }),
      });
      const body = await ticketResponseBody(response);
      if (await reauthenticateIfNeeded(response, body)) {
        return;
      }
      if (!response.ok) {
        throw new Error(ticketErrorMessage(body, 'Unable to save the selected seats.'));
      }
      setSeatPresets((current) => [...current, body]);
      setName('');
      setFeedback(`Saved ${body.name}.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setRequesting(false);
    }
  }

  async function deleteSeatPreset(preset) {
    setRequesting(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/tickets/seat-presets/${encodeURIComponent(preset.id)}`,
        { method: 'DELETE' }
      );
      const body = await ticketResponseBody(response);
      if (await reauthenticateIfNeeded(response, body)) {
        return;
      }
      if (!response.ok) {
        throw new Error(ticketErrorMessage(body, 'Unable to delete the saved seat group.'));
      }
      setSeatPresets((current) => current.filter((candidate) => candidate.id !== preset.id));
      setFeedback(`Deleted ${preset.name}.`);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setRequesting(false);
    }
  }

  function applySeatPreset(preset) {
    const compatibility = seatPresetCompatibility(preset.seatCodes, seats);
    setError(null);
    if (!compatibility.compatible) {
      setFeedback(compatibility.message);
      return;
    }
    onReplaceSelection(preset.seatCodes);
    setFeedback(`Selected ${preset.seatCodes.join(', ')}.`);
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h2" variant="h6" gutterBottom>Saved seat groups</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
        Save a usual group of seats and use it when the selected showtime has them available.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {feedback && <Alert severity="info" sx={{ mb: 2 }}>{feedback}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          disabled={actionDisabled}
          label="Saved group name"
          onChange={(event) => setName(event.target.value)}
          size="small"
          value={name}
        />
        <Button disabled={!canSave} onClick={saveCurrentSelection} variant="outlined">
          Save current selection
        </Button>
      </Stack>
      {loading ? (
        <Typography color="text.secondary" variant="body2">Loading saved seat groups…</Typography>
      ) : seatPresets.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No saved seat groups yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {seatPresets.map((preset) => (
            <Stack
              alignItems={{ sm: 'center' }}
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              key={preset.id}
              spacing={1}
            >
              <Typography variant="body2">
                <strong>{preset.name}</strong>: {preset.seatCodes.join(', ')}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  aria-label={`Use saved seat group ${preset.name}`}
                  disabled={actionDisabled}
                  onClick={() => applySeatPreset(preset)}
                  size="small"
                >
                  Use
                </Button>
                <Button
                  aria-label={`Delete saved seat group ${preset.name}`}
                  color="error"
                  disabled={actionDisabled}
                  onClick={() => void deleteSeatPreset(preset)}
                  size="small"
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

SavedSeatGroups.propTypes = {
  actionsDisabled: PropTypes.bool.isRequired,
  onReplaceSelection: PropTypes.func.isRequired,
  reauthenticateIfNeeded: PropTypes.func.isRequired,
  seats: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
  })).isRequired,
  selectedSeatCodes: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
};
