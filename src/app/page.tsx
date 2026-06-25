import { redirect } from 'next/navigation';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const token = params.token;
  if (token) {
    redirect(`/generate/image?token=${encodeURIComponent(token)}`);
  }
  redirect('/generate/image');
}
