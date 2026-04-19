import ThemeRegistry from '@/components/ThemeRegistry/ThemeRegistry';
import { StoreProvider } from '@/store/provider';

function MyApp({ Component, pageProps }) {
  return (
    <StoreProvider>
      <ThemeRegistry>
        <Component {...pageProps} />
      </ThemeRegistry>
    </StoreProvider>
  );
}

export default MyApp;
