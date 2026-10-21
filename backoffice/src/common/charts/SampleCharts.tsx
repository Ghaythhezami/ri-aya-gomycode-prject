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
  { name: 'Confirmed', value: 32, color: '#0F766E' },
  { name: 'Checked in', value: 8, color: '#16A34A' },
  { name: 'In progress', value: 4, color: '#15283F' },
  { name: 'Scheduled', value: 6, color: '#94A3B8' },
];

export function WeeklyVolumeChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={volume}>
        <CartesianGrid stroke="#E5EAF0" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <YAxis hide />
        <Tooltip />
        <Bar dataKey="value" fill="#0F766E" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaitTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={wait}>
        <CartesianGrid stroke="#E5EAF0" />
        <XAxis dataKey="hour" tickLine={false} />
        <YAxis hide />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#0F766E" strokeWidth={2} dot={false} />
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
