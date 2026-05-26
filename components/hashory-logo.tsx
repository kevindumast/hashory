"use client";

interface HashoryLogoProps {
  size?: number;
  className?: string;
}

export function HashoryLogo({ size = 64, className = "" }: HashoryLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Hashory"
    >
      <rect width="64" height="64" rx="13" fill="#2563eb" />
      <text
        x="32"
        y="46"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="38"
        fontWeight="700"
        textAnchor="middle"
        fill="white"
      >
        H
      </text>
    </svg>
  );
}
