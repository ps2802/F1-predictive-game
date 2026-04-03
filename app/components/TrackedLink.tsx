"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import {
  track,
  type GridlockEventName,
  type GridlockEventProperties,
  type TrackOptions,
} from "@/lib/analytics";

type TrackedLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    event: GridlockEventName;
    properties?: GridlockEventProperties;
    trackOptions?: TrackOptions;
  };

export function TrackedLink({
  children,
  event,
  onClick,
  properties,
  trackOptions,
  ...props
}: TrackedLinkProps) {
  function handleClick(eventObject: MouseEvent<HTMLAnchorElement>) {
    track(event, properties, trackOptions);
    onClick?.(eventObject);
  }

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
