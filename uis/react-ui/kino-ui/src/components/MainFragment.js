"use client"
import * as React from 'react';
import { Box, Snackbar, Alert } from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { clearError } from '@/app/slice';

export default function MainFragment({ children, marginLeft }) {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.app.error);

  const handleClose = (event, reason) => {
    dispatch(clearError());
  };

  return (
    <React.Fragment>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          ml: `${marginLeft}px`,
          mt: ['48px', '56px', '64px'],
          p: 3,
        }}
      >
        {children}
      </Box>
      <Snackbar
        open={error !== null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleClose} severity="error">{error}</Alert>
      </Snackbar>
    </React.Fragment>
  );
}
