import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface LapPoint {
  lap: number;
  value: number;
}

const axisTick = { fontSize: 11, fill: 'var(--chart-axis)' };

/** Single-metric lap bar chart. One series — the title names it, no legend. */
export function LapChart({
  title,
  unit,
  color,
  data,
  format,
}: {
  title: string;
  unit: string;
  color: string;
  data: LapPoint[];
  format: (value: number) => string;
}) {
  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">({unit})</span>
      </figcaption>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="lap"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tick={axisTick}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={44}
            tickFormatter={format}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            formatter={(value) => [format(Number(value)), title]}
            labelFormatter={(lap) => `Lap ${lap}`}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid var(--chart-grid)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
