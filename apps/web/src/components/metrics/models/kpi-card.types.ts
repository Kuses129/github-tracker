export interface KpiCardProps {
  title: string;
  value: number | null;
  delta?: number | null;
  isLoading: boolean;
  unit?: string;
}
