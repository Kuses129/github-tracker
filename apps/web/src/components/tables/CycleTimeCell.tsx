interface CycleTimeCellProps {
  totalSeconds: number | null;
}

function formatCycleTime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function CycleTimeCell({ totalSeconds }: CycleTimeCellProps) {
  if (totalSeconds === null) {
    return <span>—</span>;
  }
  return <span>{formatCycleTime(totalSeconds)}</span>;
}
