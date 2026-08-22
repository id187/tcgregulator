import type { BusinessActionType } from "../game/types.ts";

type BusinessActionIconProps = {
  type: BusinessActionType;
  size?: number;
};

function ActionArtwork({ type }: { type: BusinessActionType }) {
  switch (type) {
    case "tv-cm":
      return <><rect x="4" y="7" width="24" height="17" rx="2" /><path d="m11 7-4-4M21 7l4-4M12 12l8 4-8 4zM10 28h12" /></>;
    case "animation-promotion":
      return <><rect x="4" y="6" width="24" height="20" rx="2" /><path d="M9 6v20M23 6v20M4 11h5M23 11h5M4 21h5M23 21h5M14 12l6 4-6 4z" /></>;
    case "championship":
      return <><path d="M10 5h12v6c0 6-3 9-6 9s-6-3-6-9zM12 28h8M16 20v8M10 8H5v3c0 4 2 6 6 6M22 8h5v3c0 4-2 6-6 6" /><path d="m16 9 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" /></>;
    case "store-tour":
      return <><path d="M5 13h22l-3-7H8zM7 13v14h18V13M12 27v-8h8v8" /><path d="M5 13c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3" /></>;
    case "beginner-camp":
      return <><path d="m4 12 12-6 12 6-12 6zM9 15v6c4 3 10 3 14 0v-6M28 12v8" /><rect x="12" y="20" width="8" height="8" rx="1" /></>;
    case "local-league":
      return <><path d="M16 4 6 8v7c0 7 4 11 10 14 6-3 10-7 10-14V8z" /><circle cx="16" cy="13" r="3" /><path d="M16 16v7M11 20h10" /></>;
    case "lending-exchange-network":
      return <><rect x="5" y="5" width="12" height="17" rx="2" /><rect x="15" y="10" width="12" height="17" rx="2" /><path d="M19 5h6l-2-2M13 27H7l2 2M25 5l-3 3M7 27l3-3" /></>;
    case "collector-fair":
      return <><rect x="5" y="5" width="22" height="22" rx="2" /><path d="m16 9 5 7-5 7-5-7zM8 8h4M20 24h4" /><circle cx="24" cy="8" r="2" /></>;
    case "pack-odds":
      return <><path d="M8 4h16l3 5-2 19H7L5 9zM5 9h22" /><circle cx="12" cy="16" r="2" /><circle cx="20" cy="22" r="2" /><path d="m21 14-10 10" /></>;
    case "season-overhaul":
      return <><path d="M25 11a10 10 0 0 0-17-3L5 11M7 21a10 10 0 0 0 17 3l3-3M5 6v5h5M27 26v-5h-5" /><path d="M16 10v6l4 2" /></>;
    case "global-launch":
      return <><circle cx="14" cy="17" r="11" /><path d="M3 17h22M14 6c4 4 4 18 0 22M14 6c-4 4-4 18 0 22" /><path d="m20 8 8-4-3 9-2-3z" /></>;
    case "organized-play-platform":
      return <><rect x="4" y="5" width="8" height="6" rx="1" /><rect x="20" y="5" width="8" height="6" rx="1" /><rect x="12" y="22" width="8" height="6" rx="1" /><path d="M8 11v5h16v-5M16 16v6" /><circle cx="16" cy="16" r="2" /></>;
  }
}

export function BusinessActionIcon({
  type,
  size = 38,
}: BusinessActionIconProps) {
  return (
    <span aria-hidden="true" className="business-action-icon">
      <svg
        fill="none"
        focusable="false"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
        viewBox="0 0 32 32"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <ActionArtwork type={type} />
      </svg>
    </span>
  );
}
