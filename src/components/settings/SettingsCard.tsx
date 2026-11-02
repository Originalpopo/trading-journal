import type { LucideIcon } from "lucide-react";

// The white card every Settings group sits in: icon, title and a line on what it is for.
export default function SettingsCard({ icon: Icon, title, description, children }: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-950">{title}</h3>
          <p className="text-sm text-stone-500 font-medium">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export const SETTINGS_INPUT = "w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition placeholder:font-medium";
