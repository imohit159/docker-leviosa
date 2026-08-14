import { redirect } from 'next/navigation';
import { LOCAL_HOST_ID, Route } from '@/lib/constants';

/** Legacy per-volume link, from before volumes were addressed by host. */
export default async function LegacyVolumeRedirect({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  redirect(Route.volume(LOCAL_HOST_ID, decodeURIComponent(name)));
}
