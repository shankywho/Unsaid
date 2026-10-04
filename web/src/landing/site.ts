export const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL || 'https://github.com/shankar7055/Unsaid';
export const DEMO_VIDEO_URL: string = import.meta.env.VITE_DEMO_VIDEO_URL || '';

/** YouTube / Loom share URL -> embeddable URL (privacy-enhanced YouTube domain). */
export function embedUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtube.com') && url.searchParams.get('v'))
      return `https://www.youtube-nocookie.com/embed/${url.searchParams.get('v')}`;
    if (url.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed${url.pathname}`;
    if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/embed/'))
      return `https://www.youtube-nocookie.com${url.pathname}`;
    if (url.hostname.includes('loom.com'))
      return `https://www.loom.com/embed/${url.pathname.split('/').filter(Boolean).pop()}`;
  } catch {
    /* not a URL */
  }
  return null;
}
