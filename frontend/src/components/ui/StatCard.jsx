const colorMap = {
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  purple: 'from-purple-500 to-purple-600',
  emerald: 'from-emerald-500 to-emerald-600',
  orange: 'from-orange-500 to-orange-600',
  cyan: 'from-cyan-500 to-cyan-600',
  yellow: 'from-yellow-500 to-yellow-600',
  red: 'from-red-500 to-red-600',
  indigo: 'from-indigo-500 to-indigo-600',
  teal: 'from-teal-500 to-teal-600',
};

export default function StatCard({ title, value, icon: Icon, color = 'blue' }) {
  return (
    <div className={`bg-gradient-to-br ${colorMap[color] || colorMap.blue} rounded-xl p-5 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium opacity-90">{title}</span>
        {Icon && <Icon className="w-5 h-5 opacity-80" />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
