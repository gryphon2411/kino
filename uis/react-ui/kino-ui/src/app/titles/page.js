'use client'
import * as React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchTitles } from '@/app/titles/slice';
import { setView } from '@/app/titles/slice';
import GridViewIcon from '@mui/icons-material/ViewModule';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TitlesTable from '@/app/titles/components/TitlesTable';
import TitlesGrid from '@/app/titles/components/TitlesGrid';
import TableViewIcon from '@mui/icons-material/ViewList';
import SearchInput from '@/app/titles/components/SearchInput';

export default function TitlesPage() {
  const dispatch = useDispatch();
  const view = useSelector((state) => state.titles.view);

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      dispatch(setView(newView));
      dispatch(fetchTitles());
    }
  };

  return (
    <div>
      <SearchInput />
      <ToggleButtonGroup 
        value={view} 
        exclusive 
        onChange={handleViewChange}
        sx={{ ml: 2 }}
      >
        <ToggleButton value="table" title="Table View">
          <TableViewIcon />
        </ToggleButton>
        <ToggleButton value="grid" title="Grid View">
          <GridViewIcon />
        </ToggleButton>
      </ToggleButtonGroup>
      {view === 'grid' ? <TitlesGrid /> : <TitlesTable />}
    </div>
  );
}
