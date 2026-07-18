import type { Broadcaster } from "@lucarne/shared";
import { channelTt } from "@/lib/channelColor";
import { Tag } from "./common";

export function BroadcasterBadge({ b }: { b: Broadcaster }) {
  return (
    <Tag ttColor={channelTt(b.color)} title={b.note ?? b.name}>
      {b.name}
    </Tag>
  );
}
