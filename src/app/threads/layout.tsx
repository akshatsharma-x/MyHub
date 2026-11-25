import { routeMetadata } from '@/lib/routes';

// The page is a client component and so cannot export metadata; this layout
// exists to give the route its own <title>.
export const metadata = routeMetadata('/threads');

export default function ThreadsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
