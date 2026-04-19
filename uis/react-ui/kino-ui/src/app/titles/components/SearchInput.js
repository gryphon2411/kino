'use client'

import * as React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { styled } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import debounce from 'lodash/debounce';
import { setFreeText } from '@/app/titles/slice';
import { fetchTitles } from '@/app/titles/slice';

const StyledTextField = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  width: '100%',
  maxWidth: 400,
}));

export default function SearchInput() {
  const dispatch = useDispatch();
  const reduxSearchText = useSelector((state) => state.titles.freeText || '');
  const [localSearchText, setLocalSearchText] = React.useState(reduxSearchText);

  // Update local state when Redux state changes (e.g., when clearing search)
  React.useEffect(() => {
    setLocalSearchText(reduxSearchText);
  }, [reduxSearchText]);

  // Debounced search function
  const debouncedSearch = React.useMemo(
    () => debounce((searchText) => {
      if (searchText !== reduxSearchText) {
        dispatch(setFreeText(searchText));
        dispatch(fetchTitles());
      }
    }, 300),
    [dispatch, reduxSearchText]
  );

  const handleChange = (event) => {
    const searchText = event.target.value;
    setLocalSearchText(searchText);
    debouncedSearch(searchText);
  };

  const handleClear = () => {
    setLocalSearchText('');
    dispatch(setFreeText(''));
    dispatch(fetchTitles());
  };

  return (
    <StyledTextField
      variant="outlined"
      placeholder="Search titles..."
      value={localSearchText}
      onChange={handleChange}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon />
          </InputAdornment>
        ),
        endAdornment: localSearchText ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="clear search"
              onClick={handleClear}
              edge="end"
            >
              <ClearIcon />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );
}