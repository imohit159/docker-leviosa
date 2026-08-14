import { redirect } from 'next/navigation';
import { LOCAL_HOST_ID, Route } from '@/lib/constants';

/**
 * `/volumes` predates multi-host, when there was only ever this machine. Kept as a
 * permanent redirect so existing bookmarks and pasted links keep resolving to the host
 * they were written about, rather than 404ing on an upgrade.
 */
export default function LegacyVolumesRedirect() {
  redirect(Route.dashboard(LOCAL_HOST_ID));
}
