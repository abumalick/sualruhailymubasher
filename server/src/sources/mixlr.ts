export interface ChannelView {
  live: boolean;
  uid: string | null;
  streamUrl: string | null;
  startedAt: string | null;
}

interface Resource {
  type?: unknown;
  attributes?: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function parseChannelView(json: unknown): ChannelView | null {
  const data = (json as { data?: Resource } | null)?.data;
  const live = data?.attributes?.live;
  if (typeof live !== 'boolean') return null;
  const included = (json as { included?: unknown }).included;
  const broadcast = Array.isArray(included)
    ? (included as Resource[]).find((i) => i?.type === 'broadcast')?.attributes
    : undefined;
  return {
    live,
    uid: str(broadcast?.uid),
    streamUrl: str(broadcast?.progressive_stream_url),
    startedAt: str(broadcast?.started_at),
  };
}
