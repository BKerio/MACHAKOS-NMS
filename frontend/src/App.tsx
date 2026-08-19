import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router';
import DevRoleSwitcher from '@/components/dev/DevRoleSwitcher';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <DevRoleSwitcher />
    </QueryClientProvider>
  );
}

export default App;
