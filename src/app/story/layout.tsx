import { routeMetadata } from '@/lib/routes';

// The page is a client component and so cannot export metadata; this layout
// exists to give the route its own <title>.
export const metadata = routeMetadata('/story');

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
