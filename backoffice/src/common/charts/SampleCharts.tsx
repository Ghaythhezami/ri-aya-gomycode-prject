import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const volume = [
  { day: 'Mon', value: 42 },
  { day: 'Tue', value: 48 },
  { day: 'Wed', value: 39 },
  { day: 'Thu', value: 51 },
  { day: 'Fri', value: 44 },
  { day: 'Sat', value: 22 },
];

const wait = [
  { hour: '08', value: 8 },
  { hour: '10', value: 12 },
  { hour: '12', value: 15 },
  { hour: '14', value: 11 },
  { hour: '16', value: 9 },
];

export interface StatusSlice {
  name: string;
  value: number;
  color: string;
}

export const sampleStatus: StatusSlice[] = [
  { name: 'Confirmed', value: 32, color: '#0F766E' },
  { name: 'Checked in', value: 8, color: '#17A589' },
  { name: 'In progress', value: 4, color: '#1565C0' },
  { name: 'Scheduled', value: 6, color: '#CBD5E1' },
];

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #E5EAF0',
    boxShadow: '0 12px 24px -12px rgba(21,40,63,0.25)',
    fontSize: 12,
  },
  cursor: { fill: 'rgba(15,118,110,0.06)' },
};

const axis = { tickLine: false, axisLine: false, tick: { fill: '#697586', fontSize: 12 } };

export function WeeklyVolumeChart({ height = 220 }: { height?: number }) {
  const peak = Math.max(...volume.map((item) => item.value));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={volume} barCategoryGap="28%">
        <defs>
          <linearGradient id="bar-peak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1565C0" />
            <stop offset="100%" stopColor="#17A589" />
          </linearGradient>
          <linearGradient id="bar-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F766E" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#0F766E" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#EEF2F6" vertical={false} />
        <XAxis dataKey="day" {...axis} />
        <YAxis hide />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="value" radius={[10, 10, 4, 4]}>
          {volume.map((item) => (
            <Cell key={item.day} fill={item.value === peak ? 'url(#bar-peak)' : 'url(#bar-base)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaitTrendChart({ height = 220 }: { height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={wait}>
        <defs>
          <linearGradient id="wait-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17A589" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#17A589" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#EEF2F6" vertical={false} />
        <XAxis dataKey="hour" {...axis} />
        <YAxis hide />
        <Tooltip {...tooltipStyle} cursor={{ stroke: '#17A589', strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0F766E"
          strokeWidth={2.5}
          fill="url(#wait-fill)"
          dot={{ r: 3, fill: '#fff', stroke: '#0F766E', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusDonutChart({
  data = sampleStatus,
  height = 220,
}: {
  data?: StatusSlice[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="62%"
          outerRadius="88%"
          paddingAngle={3}
          cornerRadius={6}
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
