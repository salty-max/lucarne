import type { Broadcaster } from "@lucarne/shared";
import { Tag } from "./common";

export function BroadcasterBadge({ b }: { b: Broadcaster }) {
  return (
    <Tag color={b.color} title={b.note ?? b.name}>
      {b.name}
    </Tag>
  );
}
