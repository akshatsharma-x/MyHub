import { routeMetadata } from '@/lib/routes';

// The page is a client component and so cannot export metadata; this layout
// exists to give the route its own <title>.
export const metadata = routeMetadata('/constellation');

export default function ConstellationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
