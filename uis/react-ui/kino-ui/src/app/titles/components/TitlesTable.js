'use client'
import * as React from 'react';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTitles, setPage, setRowsPerPage } from '@/app/titles/slice';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';

export default function TitlesTable() {
  const dispatch = useDispatch();
  const titles = useSelector((state) => state.titles.content);
  const titlesStatus = useSelector((state) => state.titles.status);
  const titlesError = useSelector((state) => state.titles.error);
  const page = useSelector((state) => state.titles.page);
  const rowsPerPage = useSelector((state) => state.titles.rowsPerPage);

  const handleChangePage = (event, newPage) => {
    dispatch(setPage(newPage));
    dispatch(fetchTitles());
  };
  
  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    dispatch(setRowsPerPage(newRowsPerPage));
    dispatch(fetchTitles());
  };

  useEffect(() => {
    if (titlesStatus === 'idle') {
      dispatch(fetchTitles());
    }
  }, [dispatch, titlesStatus]);  

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 440 }}>
        <Table stickyHeader aria-label="sticky table">
        <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Start Year</TableCell>
              <TableCell>Genres</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {titles.map((row) => (
              <TableRow key={row.id}>
                <TableCell component="th" scope="row">{row.primaryTitle}</TableCell>
                <TableCell>{row.titleType}</TableCell>
                <TableCell>{row.startYear}</TableCell>
                <TableCell>{row.genres.join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={-1}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
}
