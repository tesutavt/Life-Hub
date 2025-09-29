export type ReportTrend = 'up' | 'down' | 'flat';

export type ReportTimelinePoint = {
  label: string;
  start: string;
  end: string;
  value: number;
};

export type ReportItem = {
  id: number | string;
  name: string;
  current: number;
  previous: number;
  difference: number;
  trend: ReportTrend;
  message: string;
  total?: number;
};

export type ReportSection = {
  key: string;
  title: string;
  subtitle: string;
  unit: string;
  summary: {
    current: number;
    previous: number;
    difference: number;
    trend: ReportTrend;
    message: string;
  };
  items: ReportItem[];
  timeline: ReportTimelinePoint[];
  insights: string[];
};

export type ReportData = {
  report_id?: number | null;
  period: 'daily' | 'weekly' | 'monthly';
  period_key: string;
  period_label: string;
  period_description?: string;
  generated_at: string;
  range: { start: string; end: string; label?: string };
  previous_range: { start: string; end: string; label?: string };
  highlights: string[];
  sections: {
    languages: ReportSection;
    courses: ReportSection;
    goals: ReportSection;
  };
};

export type ReportHistoryResponse = {
  items: ReportData[];
};

export type ReportPeriodResponse = {
  period: 'daily' | 'weekly' | 'monthly';
  period_key: string;
  period_label: string;
  report_id: number | null;
  report: ReportData;
};
