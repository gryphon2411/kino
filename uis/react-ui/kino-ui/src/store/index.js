import { configureStore } from '@reduxjs/toolkit';
import appReducer from '@/app/slice'
import titlesReducer from '@/app/titles/slice';
import titleReducer from '@/app/titles/[id]/slice'
import loginReducer from '@/pages-slices/login/slice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    titles: titlesReducer,
    title: titleReducer,
    login: loginReducer,
  },
});