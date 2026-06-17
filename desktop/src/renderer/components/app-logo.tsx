import { useI18n } from "../i18n"

interface AppLogoProps {
  size?: number
  className?: string
}

/** Skillgate mark — shared across sidebar and empty states */
export function AppLogo({ size = 24, className = "text-foreground" }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <g transform="translate(8, 8)">
        <path
          d="M16 2 L4 2 C2 2 1 4 1 6 L1 42 C1 44 2 46 4 46 L16 46"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32 2 L44 2 C46 2 47 4 47 6 L47 42 C47 44 46 46 44 46 L32 46"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="14" r="3.5" fill="currentColor" />
        <circle cx="24" cy="24" r="3.5" fill="currentColor" />
        <circle cx="24" cy="34" r="3.5" fill="currentColor" />
      </g>
    </svg>
  )
}

export function AppBrand({
  compact = false,
  version,
}: {
  compact?: boolean
  version?: string
}) {
  const { t } = useI18n()

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1 py-4">
        <AppLogo size={22} />
        <span className="text-[9px] font-semibold tracking-tight text-foreground leading-none">
          {t("app.name")}
        </span>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 border-b border-border">
      <div className="flex items-center gap-2.5">
        <AppLogo size={22} className="text-foreground flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-foreground leading-tight">
            {t("app.name")}
          </div>
          <div className="text-[11px] text-muted leading-tight mt-0.5">
            {t("app.tagline")}
          </div>
        </div>
      </div>
      {version ? (
        <span className="text-[10px] text-muted mt-2 block font-mono">
          v{version}
        </span>
      ) : null}
    </div>
  )
}