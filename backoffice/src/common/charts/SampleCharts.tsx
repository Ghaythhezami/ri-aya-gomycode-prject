import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { color } from '../../design-system/tokens';

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

const status = [
  { name: 'Confirmed', value: 32, color: color.primary },
  { name: 'Checked in', value: 8, color: color.success },
  { name: 'In progress', value: 4, color: color.navy },
  { name: 'Scheduled', value: 6, color: color['border-strong'] },
];

export function WeeklyVolumeChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={volume}>
        <CartesianGrid stroke={color.border} vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <YAxis hide />
        <Tooltip />
        <Bar dataKey="value" fill={color.primary} radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaitTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={wait}>
        <CartesianGrid stroke={color.border} />
        <XAxis dataKey="hour" tickLine={false} />
        <YAxis hide />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke={color.primary} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StatusDonutChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={status} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={3}>
          {status.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
